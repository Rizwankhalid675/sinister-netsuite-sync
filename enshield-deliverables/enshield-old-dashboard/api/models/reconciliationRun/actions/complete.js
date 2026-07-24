import { save } from "gadget-server";
import { completeReconciliation } from "../../../lib/finance/operationalFinance.js";
import { requireOperationalContext } from "../../../lib/finance/operationalActionContext.js";
import { writeAudit } from "../../../lib/audit.js";
import { assertApprovalSeparation } from "../../../lib/finance/ledger.js";
import { claimOperationalOperation, completeOperationalOperation } from "../../../lib/finance/operations.js";

export const run = async ({ record, api, session }) => {
  const { actorId, entity, access } = await requireOperationalContext({ api, session, record });
  assertApprovalSeparation({ preparedById: record.preparedById, approvedById: actorId });
  const operation = await claimOperationalOperation(api, { operationKey: `complete:${record.id}`, accountingEntityId: entity.id, operation: "complete_reconciliation", actorId, resultRecordId: record.id });
  if (!operation.claimed) return { idempotent: true, recordId: operation.receipt.resultRecordId };
  const authoritativeItems = await api.reconciliationItem.findMany({
    filter: { AND: [
      { reconciliationRunId: { equals: String(record.id) } },
      { accountingEntityId: { equals: String(record.accountingEntityId ?? record.accountingEntity?.id) } },
      { status: { equals: "exception" } },
    ] },
    first: 1,
    select: { id: true },
  });
  if (authoritativeItems.hasNextPage) throw new Error("reconciliation exception safety limit exceeded");
  record.unresolvedCount = authoritativeItems.length;
  const completed = completeReconciliation(record);
  record.status = completed.status;
  record.completedById = actorId;
  await save(record);
  await writeAudit(api, { shopId: entity.shopId, accountingEntityId: entity.id, actorEmail: access.operator.email || null, action: "finance.reconciliation.complete", entityType: "reconciliationRun", entityId: record.id, after: { status: record.status, unresolvedCount: 0, shadowMode: true } });
  await completeOperationalOperation(api, operation.receipt.id, record.id);
};

export const options = { triggers: { api: true }, transactional: true };
