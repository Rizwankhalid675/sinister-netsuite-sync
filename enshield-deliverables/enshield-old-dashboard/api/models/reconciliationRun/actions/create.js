import { applyParams, save } from "gadget-server";
import { parseReconciliationCsv, reconcileRowsOneToOne } from "../../../lib/finance/operationalFinance.js";
import { loadBoundedFinanceRows } from "../../../lib/finance/reports.js";
import { requireOperationalContext } from "../../../lib/finance/operationalActionContext.js";
import { writeAudit } from "../../../lib/audit.js";
import { claimOperationalOperation, completeOperationalOperation } from "../../../lib/finance/operations.js";

export const run = async ({ params, record, api, session }) => {
  applyParams({ reconciliationRun: params?.reconciliationRun || {} }, record);
  const rows = parseReconciliationCsv(params?.csvText);
  const { entity, access, actorId } = await requireOperationalContext({ api, session, record });
  const operation = await claimOperationalOperation(api, { operationKey: record.operationKey, accountingEntityId: entity.id, operation: "import_reconciliation", actorId, resultRecordId: record.id });
  if (!operation.claimed) return { idempotent: true, recordId: operation.receipt.resultRecordId };
  const candidates = await loadBoundedFinanceRows(({ first, after }) =>
    api.claimPayment.findMany({
      filter: { AND: [
        { accountingEntityId: { equals: String(entity.id) } },
        { status: { equals: "verified" } },
      ] },
      first, after,
      select: { id: true, externalReference: true, currency: true, amountMinor: true },
    })
  );
  const matches = reconcileRowsOneToOne(rows, candidates);
  record.shopId = String(entity.shopId);
  record.status = "processing";
  record.preparedById = actorId;
  record.unresolvedCount = matches.filter(({ result }) => result.status === "exception").length;
  await save(record);
  for (const { row, result } of matches) {
    await api.internal.reconciliationItem.create({
      accountingEntity: { _link: String(entity.id) },
      reconciliationRun: { _link: String(record.id) },
      itemKey: `${record.operationKey}:${row.rowNumber}`,
      externalReference: row.externalReference,
      currency: row.currency,
      amountMinor: row.amountMinor,
      status: result.status,
      matchedClaimPayment: result.matchedRecordId ? { _link: String(result.matchedRecordId) } : undefined,
      evidenceCode: result.evidenceCode || undefined,
    });
  }
  await writeAudit(api, { shopId: entity.shopId, accountingEntityId: entity.id, actorEmail: access.operator.email || null, action: "finance.reconciliation.import", entityType: "reconciliationRun", entityId: record.id, after: { status: record.status, rowCount: matches.length, unresolvedCount: record.unresolvedCount, shadowMode: true } });
  await completeOperationalOperation(api, operation.receipt.id, record.id);
};

export const options = { actionType: "create", transactional: true };
