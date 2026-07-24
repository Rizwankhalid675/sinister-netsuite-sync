import { applyParams, save } from "gadget-server";
import { normalizeDocument } from "../../../lib/finance/operationalFinance.js";
import { relationId, requireOperationalContext } from "../../../lib/finance/operationalActionContext.js";
import { claimOperationalOperation, completeOperationalOperation } from "../../../lib/finance/operations.js";
import { writeAudit } from "../../../lib/audit.js";
import { loadAndValidatePayableClaimContext } from "../../../lib/finance/paymentCreateControl.js";

export const run = async ({ params, record, api, session }) => {
  const input = params?.payableDocument || {};
  applyParams({ payableDocument: input }, record);
  const { entity, access, actorId } = await requireOperationalContext({ api, session, record });
  const document = normalizeDocument({ kind: "payable", shopId: entity.shopId, accountingEntityId: entity.id, documentNumber: input.documentNumber, currency: input.currency, amountMinor: input.amountMinor, operationKey: input.documentKey, preparedById: actorId });
  const claimContext = await loadAndValidatePayableClaimContext({
    api,
    shopId: entity.shopId,
    entityId: entity.id,
    claimId: relationId(record, "claim"),
    claimReserveId: relationId(record, "claimReserve"),
    currency: document.currency,
  });
  const operation = await claimOperationalOperation(api, { operationKey: `create:${document.operationKey}`, accountingEntityId: entity.id, operation: "create_document", actorId, resultRecordId: record.id });
  if (!operation.claimed) return { idempotent: true, recordId: operation.receipt.resultRecordId };
  Object.assign(record, { shopId: String(entity.shopId), currency: claimContext.currency, amountMinor: document.amountMinor, openAmountMinor: document.openAmountMinor, status: "draft", shadowMode: true, preparedById: actorId });
  await save(record);
  await writeAudit(api, { shopId: entity.shopId, accountingEntityId: entity.id, actorEmail: access.operator.email || null, action: "finance.payable.create", entityType: "payableDocument", entityId: record.id, after: { status: "draft", amountMinor: record.amountMinor, currency: record.currency, shadowMode: true } });
  await completeOperationalOperation(api, operation.receipt.id, record.id);
};

export const options = { actionType: "create", transactional: true };
