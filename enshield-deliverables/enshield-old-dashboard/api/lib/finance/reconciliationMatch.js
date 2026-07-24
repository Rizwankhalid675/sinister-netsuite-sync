export function manualMatchKey(runId, paymentId) {
  const run = String(runId ?? "").trim();
  const payment = String(paymentId ?? "").trim();
  if (!run || !payment || run.includes(":") || payment.includes(":")) {
    throw new Error("runId and paymentId are required and cannot contain ':'");
  }
  return `${run}:${payment}`;
}

function isManualMatchUniqueViolation(reason) {
  return reason?.name === "InvalidRecordError" &&
    reason?.code === "GGT_INVALID_RECORD" &&
    Array.isArray(reason?.validationErrors) &&
    reason.validationErrors.some((error) =>
      error?.apiIdentifier === "manualMatchKey" && /unique/i.test(error?.message || ""));
}

export async function claimManualReconciliationMatch({
  runId, paymentId, itemId, findExisting, save, updateCounter, writeAudit,
}) {
  const key = manualMatchKey(runId, paymentId);
  const existing = await findExisting(key);
  if (existing) {
    if (String(existing.itemId) === String(itemId)) {
      return { idempotent: true, key };
    }
    const conflict = new Error("payment is already matched in this reconciliation run");
    conflict.statusCode = 409;
    throw conflict;
  }
  try {
    await save({ key, itemId: String(itemId) });
  } catch (reason) {
    if (!isManualMatchUniqueViolation(reason)) throw reason;
    const conflict = new Error("payment was concurrently matched to another reconciliation item");
    conflict.statusCode = 409;
    throw conflict;
  }
  await updateCounter();
  await writeAudit();
  return { idempotent: false, key };
}
