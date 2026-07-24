import { PERMISSIONS } from "../permissions.js";
import { requireInternalAccess } from "../internalAccess.js";
import { shopIdFilter } from "../internalAccess.js";

export function relationId(record, field) {
  return record?.[`${field}Id`] ?? record?.[field]?.id ?? record?.[field]?._link ?? null;
}

export async function requireOperationalContext({ api, session, record }) {
  const access = await requireInternalAccess({ api, session }, PERMISSIONS.EDIT_FINANCE);
  const accountingEntityId = relationId(record, "accountingEntity");
  if (!accountingEntityId) throw new Error("accountingEntity is required");
  const entity = await api.accountingEntity.findFirst({
    filter: {
      AND: [
        { id: { equals: String(accountingEntityId) } },
        shopIdFilter(access.shopIds.map(String)),
      ],
    },
    select: { id: true, shopId: true },
  });
  if (!entity) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }
  return { access, entity, actorId: String(access.operator.id) };
}

export function sanitizedFinanceAudit({ action, entityType, entityId, status, amountMinor, currency }) {
  return {
    action,
    entityType,
    entityId: String(entityId),
    after: { status, amountMinor, currency, shadowMode: true },
  };
}

export async function requireSameScopeRelation({
  api, model, id, scopeField, scopeId,
}) {
  if (!id || !scopeField || !scopeId || !api?.[model]?.findFirst) {
    throw new Error("operational relation and scope are required");
  }
  const record = await api[model].findFirst({
    filter: {
      AND: [
        { id: { equals: String(id) } },
        { [scopeField]: { equals: String(scopeId) } },
      ],
    },
    select: { id: true },
  });
  if (!record) {
    const error = new Error(`${model} is outside the accounting scope`);
    error.statusCode = 403;
    throw error;
  }
  return record;
}
