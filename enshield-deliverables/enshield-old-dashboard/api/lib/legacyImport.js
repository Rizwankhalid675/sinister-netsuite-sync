const RESOURCES = new Set(["clients", "orders", "claims"]);
const IMPORT_ROLES = new Set(["Super Admin", "Administrator"]);
const BATCH_LIMIT = 100;

function importError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

export function validateLegacyImportRequest(body, environment = process.env.NODE_ENV) {
  if (environment === "production") {
    throw importError("Legacy production import is disabled in production", 403);
  }
  const resource = body?.resource;
  const records = body?.records;
  if (!RESOURCES.has(resource)) throw importError("Unsupported legacy resource");
  if (!Array.isArray(records)) throw importError("records must be an array");
  if (records.length > BATCH_LIMIT) throw importError("Import batches may contain at most 100 records");
  for (const record of records) {
    if (!record || typeof record !== "object" || typeof record.sourceKey !== "string") {
      throw importError("Every imported record requires a sourceKey");
    }
  }
  return { resource, records };
}

export function assertLegacyImporter(identity) {
  const allowed = (identity?.assignments || []).some(
    (assignment) => assignment?.status === "active" && IMPORT_ROLES.has(assignment?.role?.name)
  );
  if (!allowed) throw importError("Forbidden", 403);
}

const comparable = (value) => value instanceof Date ? value.toISOString() : value ?? null;

function isUnchanged(existing, input) {
  return Object.entries(input).every(([key, value]) => {
    if (key.endsWith("Id")) return true;
    return comparable(existing?.[key]) === comparable(value);
  });
}

async function resolveClient(api, legacyClientId) {
  const client = await api.client.maybeFindFirst({
    filter: { legacySourceKey: { equals: `nova:client:${legacyClientId}` } },
    select: { id: true },
  });
  if (!client) throw importError("Imported order or claim references an unknown legacy client", 409);
  return client;
}

async function resolveOrder(api, legacyOrderId) {
  if (!legacyOrderId) return null;
  return api.legacyOrder.maybeFindFirst({
    filter: { sourceKey: { equals: `nova:order:${legacyOrderId}` } },
    select: { id: true },
  });
}

async function findByKeys(model, field, keys, select) {
  if (!keys.length) return [];
  return model.findMany({
    first: Math.min(keys.length, BATCH_LIMIT),
    filter: { [field]: { in: keys } },
    select,
  });
}

async function upsertClient(api, record) {
  const input = {
    legacySourceKey: record.sourceKey,
    legacyStoreId: record.legacyId,
    storeId: record.storeId,
    storeName: record.storeName,
    platform: record.platform,
    apiEnabled: record.apiEnabled,
    customerSince: record.customerSince || undefined,
    status: record.status,
  };
  const existing = await api.client.maybeFindFirst({
    filter: { legacySourceKey: { equals: record.sourceKey } },
    select: { id: true, ...Object.fromEntries(Object.keys(input).map((key) => [key, true])) },
  });
  if (!existing) {
    await api.internal.client.create(input);
    return "created";
  }
  if (isUnchanged(existing, input)) return "unchanged";
  await api.internal.client.update(existing.id, input);
  return "updated";
}

async function upsertOrder(api, record) {
  const client = await resolveClient(api, record.legacyClientId);
  const input = {
    sourceKey: record.sourceKey,
    legacyId: record.legacyId,
    platform: record.platform,
    orderNumber: record.orderNumber,
    valueMinor: record.valueMinor,
    protectionCostMinor: record.protectionCostMinor,
    taxMinor: record.taxMinor,
    shippingMinor: record.shippingMinor,
    currency: record.currency,
    status: record.status,
    isShipped: record.isShipped === true,
    trackingNumber: record.trackingNumber || undefined,
    placedAt: record.placedAt || undefined,
    client: { _link: client.id },
  };
  const existing = await api.legacyOrder.maybeFindFirst({
    filter: { sourceKey: { equals: record.sourceKey } },
    select: { id: true, sourceKey: true, legacyId: true, platform: true, orderNumber: true,
      valueMinor: true, protectionCostMinor: true, taxMinor: true, shippingMinor: true,
      currency: true, status: true, isShipped: true, trackingNumber: true, placedAt: true, clientId: true },
  });
  const comparableInput = { ...input, clientId: client.id };
  delete comparableInput.client;
  if (!existing) {
    await api.internal.legacyOrder.create(input);
    return "created";
  }
  if (isUnchanged(existing, comparableInput)) return "unchanged";
  await api.internal.legacyOrder.update(existing.id, input);
  return "updated";
}

async function upsertClaim(api, record) {
  const client = await resolveClient(api, record.legacyClientId);
  const order = await resolveOrder(api, record.legacyOrderId);
  const input = {
    sourceKey: record.sourceKey,
    legacyId: record.legacyId,
    platform: record.platform,
    claimValueMinor: record.claimValueMinor,
    currency: record.currency,
    status: record.status,
    submittedAt: record.submittedAt || undefined,
    client: { _link: client.id },
    ...(order ? { legacyOrder: { _link: order.id } } : {}),
  };
  const existing = await api.legacyClaim.maybeFindFirst({
    filter: { sourceKey: { equals: record.sourceKey } },
    select: { id: true, sourceKey: true, legacyId: true, platform: true, claimValueMinor: true,
      currency: true, status: true, submittedAt: true, clientId: true, legacyOrderId: true },
  });
  const comparableInput = { ...input, clientId: client.id, legacyOrderId: order?.id ?? null };
  delete comparableInput.client;
  delete comparableInput.legacyOrder;
  if (!existing) {
    await api.internal.legacyClaim.create(input);
    return "created";
  }
  if (isUnchanged(existing, comparableInput)) return "unchanged";
  await api.internal.legacyClaim.update(existing.id, input);
  return "updated";
}

export async function upsertLegacyBatch(api, resource, records) {
  const result = { created: 0, updated: 0, unchanged: 0, rejected: 0 };
  if (resource === "orders") return upsertOrderBatch(api, records);
  if (resource === "claims") return upsertClaimBatch(api, records);
  const upsert = upsertClient;
  for (const record of records) {
    try {
      result[await upsert(api, record)] += 1;
    } catch (error) {
      if (error?.statusCode === 409) result.rejected += 1;
      else throw error;
    }
  }
  return result;
}

async function upsertOrderBatch(api, records) {
  const result = { created: 0, updated: 0, unchanged: 0, rejected: 0 };
  const clientKeys = [...new Set(records.map((record) => `nova:client:${record.legacyClientId}`))];
  const clients = await findByKeys(api.client, "legacySourceKey", clientKeys, { id: true, legacySourceKey: true });
  const clientByKey = new Map(clients.map((client) => [client.legacySourceKey, client]));
  const select = { id: true, sourceKey: true, legacyId: true, platform: true, orderNumber: true,
    valueMinor: true, protectionCostMinor: true, taxMinor: true, shippingMinor: true,
    currency: true, status: true, isShipped: true, trackingNumber: true, placedAt: true, clientId: true };
  const existing = await findByKeys(api.legacyOrder, "sourceKey", records.map((record) => record.sourceKey), select);
  const existingByKey = new Map(existing.map((order) => [order.sourceKey, order]));
  const creates = [];
  const updates = [];

  for (const record of records) {
    const client = clientByKey.get(`nova:client:${record.legacyClientId}`);
    if (!client) { result.rejected += 1; continue; }
    const input = {
      sourceKey: record.sourceKey, legacyId: record.legacyId, platform: record.platform,
      orderNumber: record.orderNumber, valueMinor: record.valueMinor,
      protectionCostMinor: record.protectionCostMinor, taxMinor: record.taxMinor,
      shippingMinor: record.shippingMinor, currency: record.currency, status: record.status,
      isShipped: record.isShipped === true, trackingNumber: record.trackingNumber || undefined,
      placedAt: record.placedAt || undefined, client: { _link: client.id },
    };
    const found = existingByKey.get(record.sourceKey);
    if (!found) { creates.push(input); continue; }
    const comparableInput = { ...input, clientId: client.id };
    delete comparableInput.client;
    if (isUnchanged(found, comparableInput)) result.unchanged += 1;
    else updates.push([found.id, input]);
  }

  if (creates.length) {
    await api.internal.legacyOrder.bulkCreate(creates);
    result.created += creates.length;
  }
  for (const [id, input] of updates) await api.internal.legacyOrder.update(id, input);
  result.updated += updates.length;
  return result;
}

async function upsertClaimBatch(api, records) {
  const result = { created: 0, updated: 0, unchanged: 0, rejected: 0 };
  const clientKeys = [...new Set(records.map((record) => `nova:client:${record.legacyClientId}`))];
  const orderKeys = [...new Set(records.filter((record) => record.legacyOrderId).map((record) => `nova:order:${record.legacyOrderId}`))];
  const [clients, orders, existing] = await Promise.all([
    findByKeys(api.client, "legacySourceKey", clientKeys, { id: true, legacySourceKey: true }),
    findByKeys(api.legacyOrder, "sourceKey", orderKeys, { id: true, sourceKey: true }),
    findByKeys(api.legacyClaim, "sourceKey", records.map((record) => record.sourceKey), {
      id: true, sourceKey: true, legacyId: true, platform: true, claimValueMinor: true,
      currency: true, status: true, submittedAt: true, clientId: true, legacyOrderId: true,
    }),
  ]);
  const clientByKey = new Map(clients.map((client) => [client.legacySourceKey, client]));
  const orderByKey = new Map(orders.map((order) => [order.sourceKey, order]));
  const existingByKey = new Map(existing.map((claim) => [claim.sourceKey, claim]));
  const creates = [];
  const updates = [];

  for (const record of records) {
    const client = clientByKey.get(`nova:client:${record.legacyClientId}`);
    if (!client) { result.rejected += 1; continue; }
    const order = record.legacyOrderId ? orderByKey.get(`nova:order:${record.legacyOrderId}`) : null;
    const input = {
      sourceKey: record.sourceKey, legacyId: record.legacyId, platform: record.platform,
      claimValueMinor: record.claimValueMinor, currency: record.currency, status: record.status,
      submittedAt: record.submittedAt || undefined, client: { _link: client.id },
      ...(order ? { legacyOrder: { _link: order.id } } : {}),
    };
    const found = existingByKey.get(record.sourceKey);
    if (!found) { creates.push(input); continue; }
    const comparableInput = { ...input, clientId: client.id, legacyOrderId: order?.id ?? null };
    delete comparableInput.client;
    delete comparableInput.legacyOrder;
    if (isUnchanged(found, comparableInput)) result.unchanged += 1;
    else updates.push([found.id, input]);
  }

  if (creates.length) {
    await api.internal.legacyClaim.bulkCreate(creates);
    result.created += creates.length;
  }
  for (const [id, input] of updates) await api.internal.legacyClaim.update(id, input);
  result.updated += updates.length;
  return result;
}
