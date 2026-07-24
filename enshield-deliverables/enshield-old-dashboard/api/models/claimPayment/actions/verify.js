import { save } from "gadget-server";
import { writeAudit } from "../../../lib/audit.js";
import { recordExternalPayment } from "../../../lib/finance/operationalFinance.js";
import { calculateReserveRollForward } from "../../../lib/finance/operationalFinance.js";
import { normalizeCurrency } from "../../../lib/finance/ledger.js";
import { relationId, requireOperationalContext, sanitizedFinanceAudit } from "../../../lib/finance/operationalActionContext.js";
import { claimDocumentBalance, claimOperationalOperation, claimRecordRevision, completeOperationalOperation } from "../../../lib/finance/operations.js";

export const run = async ({ record, api, session }) => {
  if (record.status !== "pending") throw new Error("only pending payments may be verified");
  const { entity, access, actorId } = await requireOperationalContext({ api, session, record });
  const operation = await claimOperationalOperation(api, { operationKey: `verify:${record.paymentKey}`, accountingEntityId: entity.id, operation: "verify_payment", actorId, resultRecordId: record.id });
  if (!operation.claimed) return { idempotent: true, recordId: operation.receipt.resultRecordId };
  const payableId = relationId(record, "payableDocument");
  const payable = await api.payableDocument.findFirst({
    filter: { AND: [
      { id: { equals: String(payableId) } },
      { accountingEntityId: { equals: String(entity.id) } },
    ] },
  });
  if (!payable) throw new Error("Payable not found");
  const reserveId = relationId(record, "claimReserve");
  const reserve = await api.claimReserve.findFirst({
    filter: { AND: [
      { id: { equals: String(reserveId) } },
      { accountingEntityId: { equals: String(entity.id) } },
      { claimId: { equals: String(relationId(record, "claim")) } },
    ] },
  });
  if (!reserve) throw new Error("Claim reserve not found");
  const paymentCurrency = normalizeCurrency(record.currency);
  if (normalizeCurrency(payable.currency) !== paymentCurrency ||
      normalizeCurrency(reserve.currency) !== paymentCurrency) {
    throw new Error("payment, payable, and claim reserve currency must match");
  }
  await claimDocumentBalance(api, { documentId: payable.id, openAmountMinor: payable.openAmountMinor, accountingEntityId: entity.id, actorId });
  const reserveRevision = Number(reserve.reserveRevision ?? 0);
  await claimRecordRevision(api, { recordType: "reserve", recordId: reserve.id, revision: reserveRevision, accountingEntityId: entity.id, actorId });
  const payment = recordExternalPayment(payable, {
    accountingEntityId: String(entity.id),
    currency: record.currency,
    amountMinor: record.amountMinor,
    externalReference: record.externalReference,
    operationKey: record.paymentKey,
    recordedById: record.recordedById,
    verifiedById: actorId,
  });
  payable.openAmountMinor = Number(payable.openAmountMinor) - payment.amountMinor;
  payable.status = payment.payableStatus;
  await api.internal.payableDocument.update(payable.id, {
    openAmountMinor: payable.openAmountMinor,
    status: payable.status,
  });
  reserve.paymentsMinor = Number(reserve.paymentsMinor || 0) + payment.amountMinor;
  reserve.closingMinor = calculateReserveRollForward(reserve);
  reserve.reserveRevision = reserveRevision + 1;
  await api.internal.claimReserve.update(reserve.id, { paymentsMinor: reserve.paymentsMinor, closingMinor: reserve.closingMinor, reserveRevision: reserve.reserveRevision });
  await api.internal.claimReserveMovement.create({ accountingEntity: { _link: String(entity.id) }, claimReserve: { _link: String(reserve.id) }, operationKey: `payment:${record.paymentKey}`, currency: record.currency, movementType: "payment", amountMinor: record.amountMinor, effectiveAt: new Date().toISOString() });
  record.status = "verified";
  record.verifiedById = actorId;
  record.verifiedAt = new Date().toISOString();
  await save(record);
  await writeAudit(api, {
    shopId: entity.shopId,
    accountingEntityId: entity.id,
    actorEmail: access.operator.email || null,
    ...sanitizedFinanceAudit({ action: "finance.payment.verify", entityType: "claimPayment", entityId: record.id, status: record.status, amountMinor: record.amountMinor, currency: record.currency }),
  });
  await completeOperationalOperation(api, operation.receipt.id, record.id);
};

export const options = { triggers: { api: true }, transactional: true };
