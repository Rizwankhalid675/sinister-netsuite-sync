import { save } from "gadget-server";
import { approveDocument } from "../../../lib/finance/operationalFinance.js";
import { requireOperationalContext } from "../../../lib/finance/operationalActionContext.js";
import { writeAudit } from "../../../lib/audit.js";
import { claimOperationalOperation, completeOperationalOperation } from "../../../lib/finance/operations.js";

export const run = async ({ record, api, session }) => {
  const { actorId, entity, access } = await requireOperationalContext({ api, session, record });
  const operation = await claimOperationalOperation(api, { operationKey: `approve:${record.id}`, accountingEntityId: entity.id, operation: "approve_document", actorId, resultRecordId: record.id });
  if (!operation.claimed) return { idempotent: true, recordId: operation.receipt.resultRecordId };
  const approved = approveDocument(record, actorId);
  record.status = approved.status;
  record.approvedById = approved.approvedById;
  await save(record);
  await writeAudit(api, { shopId: entity.shopId, accountingEntityId: entity.id, actorEmail: access.operator.email || null, action: "finance.payable.approve", entityType: "payableDocument", entityId: record.id, after: { status: record.status, shadowMode: true } });
  await completeOperationalOperation(api, operation.receipt.id, record.id);
};

export const options = { triggers: { api: true }, transactional: true };
