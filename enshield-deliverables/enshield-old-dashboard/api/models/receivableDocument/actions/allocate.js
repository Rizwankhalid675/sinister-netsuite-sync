import { save } from "gadget-server";
import { writeAudit } from "../../../lib/audit.js";
import { allocateDocument } from "../../../lib/finance/operationalFinance.js";
import { requireOperationalContext, sanitizedFinanceAudit } from "../../../lib/finance/operationalActionContext.js";
import { claimDocumentBalance, claimOperationalOperation, completeOperationalOperation } from "../../../lib/finance/operations.js";

export const run = async ({ params, record, api, session }) => {
  const { entity, access, actorId } = await requireOperationalContext({ api, session, record });
  const allocation = params?.allocation || {};
  const operation = await claimOperationalOperation(api, { operationKey: allocation.operationKey, accountingEntityId: entity.id, operation: "allocate_document", actorId, resultRecordId: record.id });
  if (!operation.claimed) return { idempotent: true, recordId: operation.receipt.resultRecordId };
  await claimDocumentBalance(api, { documentId: record.id, openAmountMinor: record.openAmountMinor, accountingEntityId: entity.id, actorId });
  const next = allocateDocument(record, { ...allocation, accountingEntityId: String(entity.id) });
  await api.internal.receivableAllocation.create({
    accountingEntity: { _link: String(entity.id) },
    receivableDocument: { _link: String(record.id) },
    operationKey: allocation.operationKey,
    currency: allocation.currency,
    amountMinor: allocation.amountMinor,
  });
  record.openAmountMinor = next.openAmountMinor;
  record.status = next.status;
  await save(record);
  await writeAudit(api, {
    shopId: entity.shopId,
    accountingEntityId: entity.id,
    actorEmail: access.operator.email || null,
    ...sanitizedFinanceAudit({ action: "finance.receivable.allocate", entityType: "receivableDocument", entityId: record.id, status: record.status, amountMinor: allocation.amountMinor, currency: allocation.currency }),
  });
  await completeOperationalOperation(api, operation.receipt.id, record.id);
};

export const options = { triggers: { api: true }, transactional: true };
