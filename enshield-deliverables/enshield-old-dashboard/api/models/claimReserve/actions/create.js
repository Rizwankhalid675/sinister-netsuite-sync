import { applyParams, save } from "gadget-server";
import { calculateReserveRollForward } from "../../../lib/finance/operationalFinance.js";
import { relationId, requireOperationalContext, requireSameScopeRelation } from "../../../lib/finance/operationalActionContext.js";
import { claimOperationalOperation, completeOperationalOperation } from "../../../lib/finance/operations.js";
import { writeAudit } from "../../../lib/audit.js";

export const run = async ({ params, record, api, session }) => {
  const input = params?.claimReserve || {};
  applyParams({ claimReserve: input }, record);
  const { entity, access, actorId } = await requireOperationalContext({ api, session, record });
  await requireSameScopeRelation({
    api,
    model: "claim",
    id: relationId(record, "claim"),
    scopeField: "shopId",
    scopeId: entity.shopId,
  });
  const openingMinor = Number(input.openingMinor);
  const closingMinor = calculateReserveRollForward({ openingMinor, additionsMinor: 0, releasesMinor: 0, paymentsMinor: 0 });
  const operation = await claimOperationalOperation(api, { operationKey: `create:${input.reserveKey}`, accountingEntityId: entity.id, operation: "create_reserve", actorId, resultRecordId: record.id });
  if (!operation.claimed) return { idempotent: true, recordId: operation.receipt.resultRecordId };
  Object.assign(record, { shopId: String(entity.shopId), openingMinor, additionsMinor: 0, releasesMinor: 0, paymentsMinor: 0, closingMinor, reserveRevision: 0 });
  await save(record);
  await api.internal.claimReserveMovement.create({ accountingEntity: { _link: String(entity.id) }, claimReserve: { _link: String(record.id) }, operationKey: `opening:${input.reserveKey}`, currency: record.currency, movementType: "opening", amountMinor: openingMinor, effectiveAt: new Date().toISOString() });
  await writeAudit(api, { shopId: entity.shopId, accountingEntityId: entity.id, actorEmail: access.operator.email || null, action: "finance.reserve.create", entityType: "claimReserve", entityId: record.id, after: { openingMinor, closingMinor, currency: record.currency, shadowMode: true } });
  await completeOperationalOperation(api, operation.receipt.id, record.id);
};

export const options = { actionType: "create", transactional: true };
