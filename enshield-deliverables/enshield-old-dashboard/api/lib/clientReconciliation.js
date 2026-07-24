import { inTransit } from "./metrics.js";
import { currencyOf } from "./money.js";
import { majorToMinor } from "./protection.js";

function relationId(record, key) {
  return record?.[`${key}Id`] ?? record?.[key]?.id ?? null;
}

export function computeClientRollup({ clientId, claims, orders }) {
  const claimCount = claims.reduce(
    (count, claim) =>
      count + (String(relationId(claim, "client")) === String(clientId) ? 1 : 0),
    0
  );
  let valueInTransitMinor = 0;
  let valueInTransitCurrency = null;
  for (const order of orders) {
    if (!inTransit(order)) continue;
    const bag = order.currentTotalPriceSet;
    const currency = currencyOf(bag);
    const amount = bag?.shopMoney?.amount ?? bag?.presentmentMoney?.amount;
    if (!currency || amount == null) {
      throw new Error("Ambiguous in-transit order currency or amount");
    }
    const normalizedCurrency = String(currency).toUpperCase();
    if (
      valueInTransitCurrency &&
      valueInTransitCurrency !== normalizedCurrency
    ) {
      throw new Error("Mixed in-transit currencies cannot share one client cache");
    }
    valueInTransitCurrency = normalizedCurrency;
    valueInTransitMinor += majorToMinor(amount, normalizedCurrency);
    if (!Number.isSafeInteger(valueInTransitMinor)) {
      throw new Error("In-transit minor-unit total exceeds safe integer range");
    }
  }
  return {
    claimCount,
    valueInTransitMinor,
    valueInTransitCurrency,
  };
}

export async function reconcileClientRecords({ api, clients, claims, orders }) {
  let updated = 0;
  for (const client of clients) {
    const expected = computeClientRollup({
      clientId: client.id,
      claims,
      orders,
    });
    if (
      Number(client.claimCount || 0) === expected.claimCount &&
      Number(client.valueInTransitMinor || 0) === expected.valueInTransitMinor &&
      (client.valueInTransitCurrency || null) === expected.valueInTransitCurrency
    ) {
      continue;
    }
    await api.internal.client.update(client.id, expected);
    updated += 1;
  }
  return { examined: clients.length, updated };
}

async function loadAll(manager, options, maxRecords = 100000) {
  const rows = [];
  let page = await manager.findMany(options);
  rows.push(...page);
  while (page.hasNextPage) {
    if (rows.length >= maxRecords) {
      const error = new Error("Reconciliation safety limit exceeded");
      error.statusCode = 503;
      throw error;
    }
    page = await page.nextPage();
    rows.push(...page);
  }
  return rows;
}

export async function runClientReconciliationForShop({
  api,
  shopId,
  maxRecords = 100000,
}) {
  if (!shopId) {
    const error = new Error("shopId is required");
    error.statusCode = 400;
    throw error;
  }
  const filter = { shopId: { equals: shopId } };
  const [clients, claims, orders] = await Promise.all([
    loadAll(api.client, {
      filter,
      first: 250,
      select: {
        id: true,
        claimCount: true,
        valueInTransitMinor: true,
        valueInTransitCurrency: true,
      },
    }, maxRecords),
    loadAll(api.claim, {
      filter,
      first: 250,
      select: { id: true, clientId: true, client: { id: true } },
    }, maxRecords),
    loadAll(api.shopifyOrder, {
      filter,
      first: 250,
      select: {
        id: true,
        fulfillmentStatus: true,
        financialStatus: true,
        currentTotalPriceSet: true,
      },
    }, maxRecords),
  ]);
  return reconcileClientRecords({ api, clients, claims, orders });
}
