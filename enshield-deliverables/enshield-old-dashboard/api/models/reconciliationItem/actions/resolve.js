import { save } from "gadget-server";
import { requireOperationalContext, relationId } from "../../../lib/finance/operationalActionContext.js";
import { claimOperationalOperation, completeOperationalOperation } from "../../../lib/finance/operations.js";
import { writeAudit } from "../../../lib/audit.js";
import { claimManualReconciliationMatch, manualMatchKey } from "../../../lib/finance/reconciliationMatch.js";

export const run = async ({ params, record, api, session }) => {
  const { entity, access, actorId } = await requireOperationalContext({ api, session, record });
  const { operationKey, matchedClaimPaymentId, evidenceCode, resolutionReason } = params || {};
  if (!matchedClaimPaymentId || !evidenceCode?.trim() || !resolutionReason?.trim()) throw new Error("matched payment, evidence code, and resolution reason are required");
  const runId = relationId(record, "reconciliationRun");
  const run = await api.reconciliationRun.findFirst({
    filter: { AND: [
      { id: { equals: String(runId) } },
      { accountingEntityId: { equals: String(relationId(record, "accountingEntity")) } },
    ] },
  });
  if (!run || run.status !== "processing") throw new Error("reconciliation run is not processing");
  const payment = await api.claimPayment.findFirst({ filter: { AND: [
    { id: { equals: String(matchedClaimPaymentId) } },
    { accountingEntityId: { equals: String(entity.id) } },
    { status: { equals: "verified" } },
  ] }, select: { id: true } });
  if (!payment) throw new Error("matched payment is outside the accounting scope");
  const matchKey = manualMatchKey(run.id, payment.id);
  let operation;
  const match = await claimManualReconciliationMatch({
    runId: run.id,
    paymentId: payment.id,
    itemId: record.id,
    findExisting: async () => {
      const existing = await api.reconciliationItem.findFirst({
        filter: { AND: [
          { reconciliationRunId: { equals: String(run.id) } },
          { manualMatchKey: { equals: matchKey } },
        ] },
        select: { id: true, manualMatchKey: true },
      });
      return existing ? { key: existing.manualMatchKey, itemId: existing.id } : null;
    },
    save: async ({ key }) => {
      if (record.status !== "exception") throw new Error("only reconciliation exceptions may be resolved");
      operation = await claimOperationalOperation(api, { operationKey, accountingEntityId: entity.id, operation: "resolve_reconciliation", actorId, resultRecordId: record.id });
      if (!operation.claimed) return;
      record.status = "matched";
      record.matchedClaimPayment = { _link: String(payment.id) };
      record.manualMatchKey = key;
      record.evidenceCode = evidenceCode.trim();
      record.resolutionReason = resolutionReason.trim();
      record.resolvedById = actorId;
      record.resolvedAt = new Date().toISOString();
      await save(record);
    },
    updateCounter: async () => {
      const remaining = await api.reconciliationItem.findMany({
        filter: { AND: [
          { reconciliationRunId: { equals: String(run.id) } },
          { status: { equals: "exception" } },
        ] },
        first: 10001,
        select: { id: true },
      });
      if (remaining.hasNextPage) throw new Error("reconciliation exception safety limit exceeded");
      await api.internal.reconciliationRun.update(run.id, { unresolvedCount: remaining.length });
    },
    writeAudit: async () => writeAudit(api, { shopId: entity.shopId, accountingEntityId: entity.id, actorEmail: access.operator.email || null, action: "finance.reconciliation.resolve", entityType: "reconciliationItem", entityId: record.id, after: { status: "matched", evidenceCode: record.evidenceCode, matchedClaimPaymentId: payment.id, shadowMode: true } }),
  });
  if (match.idempotent || !operation?.claimed) return { idempotent: true, recordId: record.id };
  await completeOperationalOperation(api, operation.receipt.id, record.id);
};

export const options = { triggers: { api: true }, transactional: true };
