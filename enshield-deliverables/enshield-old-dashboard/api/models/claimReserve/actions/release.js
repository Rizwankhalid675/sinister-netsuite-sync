import { save } from "gadget-server";
import { calculateReserveRollForward } from "../../../lib/finance/operationalFinance.js";
import { requireOperationalContext } from "../../../lib/finance/operationalActionContext.js";
import { writeAudit } from "../../../lib/audit.js";
import { claimOperationalOperation, claimRecordRevision, completeOperationalOperation } from "../../../lib/finance/operations.js";

export const run = async ({ params, record, api, session }) => {
  const { entity, access, actorId } = await requireOperationalContext({ api, session, record });
  const amountMinor = params?.amountMinor;
  const operationKey = params?.operationKey;
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) throw new Error("amountMinor must be a positive integer");
  const operation = await claimOperationalOperation(api, { operationKey, accountingEntityId: entity.id, operation: "release_reserve", actorId, resultRecordId: record.id });
  if (!operation.claimed) return { idempotent: true, recordId: operation.receipt.resultRecordId };
  const reserveRevision = Number(record.reserveRevision ?? 0);
  await claimRecordRevision(api, { recordType: "reserve", recordId: record.id, revision: reserveRevision, accountingEntityId: entity.id, actorId });
  record.releasesMinor = Number(record.releasesMinor || 0) + amountMinor;
  record.closingMinor = calculateReserveRollForward(record);
  record.reserveRevision = reserveRevision + 1;
  await save(record);
  await api.internal.claimReserveMovement.create({ accountingEntity: { _link: String(entity.id) }, claimReserve: { _link: String(record.id) }, operationKey, currency: record.currency, movementType: "release", amountMinor, effectiveAt: new Date().toISOString() });
  await writeAudit(api, { shopId: entity.shopId, accountingEntityId: entity.id, actorEmail: access.operator.email || null, action: "finance.reserve.release", entityType: "claimReserve", entityId: record.id, after: { amountMinor, closingMinor: record.closingMinor, currency: record.currency, shadowMode: true } });
  await completeOperationalOperation(api, operation.receipt.id, record.id);
};

export const options = { triggers: { api: true }, transactional: true };
