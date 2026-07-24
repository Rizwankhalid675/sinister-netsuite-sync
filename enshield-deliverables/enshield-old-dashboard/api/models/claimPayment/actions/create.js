import { applyParams, save } from "gadget-server";
import { relationId, requireOperationalContext, requireSameScopeRelation } from "../../../lib/finance/operationalActionContext.js";
import { claimOperationalOperation, completeOperationalOperation } from "../../../lib/finance/operations.js";
import { writeAudit } from "../../../lib/audit.js";
import { loadAndValidatePaymentAuthority } from "../../../lib/finance/paymentCreateControl.js";

export const run = async ({ params, record, api, session }) => {
  applyParams({ claimPayment: params?.claimPayment || {} }, record);
  const { actorId, entity, access } = await requireOperationalContext({ api, session, record });
  const claimId = relationId(record, "claim");
  await requireSameScopeRelation({ api, model: "claim", id: claimId, scopeField: "shopId", scopeId: entity.shopId });
  const authority = await loadAndValidatePaymentAuthority({
    api,
    entityId: entity.id,
    claimId,
    payableDocumentId: relationId(record, "payableDocument"),
    claimReserveId: relationId(record, "claimReserve"),
    currency: record.currency,
    amountMinor: record.amountMinor,
  });
  record.currency = authority.currency;
  const operation = await claimOperationalOperation(api, { operationKey: `record:${record.paymentKey}`, accountingEntityId: entity.id, operation: "record_payment", actorId, resultRecordId: record.id });
  if (!operation.claimed) return { idempotent: true, recordId: operation.receipt.resultRecordId };
  record.recordedById = actorId;
  record.verifiedById = null;
  record.status = "pending";
  record.initiatedBySystem = false;
  await save(record);
  await writeAudit(api, { shopId: entity.shopId, accountingEntityId: entity.id, actorEmail: access.operator.email || null, action: "finance.payment.record", entityType: "claimPayment", entityId: record.id, after: { status: record.status, amountMinor: record.amountMinor, currency: record.currency, shadowMode: true } });
  await completeOperationalOperation(api, operation.receipt.id, record.id);
};

export const options = { actionType: "create", transactional: true };
