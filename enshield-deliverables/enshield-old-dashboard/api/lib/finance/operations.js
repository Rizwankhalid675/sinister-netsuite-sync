function keyPart(value, name) {
  const result = typeof value === "string" ? value.trim() : String(value ?? "");
  if (!result || result.includes(":")) throw new Error(`${name} is required and cannot contain ':'`);
  return result;
}

function operationKeyPart(value) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!/^[A-Za-z0-9._|~:-]{1,512}$/.test(result)) {
    throw new Error("operationKey has invalid format");
  }
  return result;
}

export function deriveAccountKey(accountingEntityId, code) {
  return `${keyPart(accountingEntityId, "accountingEntityId")}:${keyPart(code, "code")}`;
}

export function deriveJournalLineKey(journalEntryId, sequence) {
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("sequence must be a positive integer");
  }
  return `${keyPart(journalEntryId, "journalEntryId")}:${sequence}`;
}

export function deriveReversalKey(originalJournalEntryId) {
  return `reverse:${keyPart(originalJournalEntryId, "originalJournalEntryId")}`;
}

export function deriveFinanceOperationKey(journalEntryId, operation) {
  const allowed = new Set(["submit", "approve", "post", "reverse"]);
  if (!allowed.has(operation)) throw new Error("unsupported finance operation");
  return `${keyPart(journalEntryId, "journalEntryId")}:${operation}`;
}

export function hasOperationKeyUniqueViolation(reason) {
  return (
    reason?.name === "InvalidRecordError" &&
    reason?.code === "GGT_INVALID_RECORD" &&
    Array.isArray(reason?.validationErrors) &&
    reason.validationErrors.some(
      (error) =>
        error?.apiIdentifier === "operationKey" &&
        /unique/i.test(error?.message || "")
    )
  );
}

export function hasSourceVersionKeyUniqueViolation(reason) {
  return (
    reason?.name === "InvalidRecordError" &&
    reason?.code === "GGT_INVALID_RECORD" &&
    Array.isArray(reason?.validationErrors) &&
    reason.validationErrors.some(
      (error) =>
        error?.apiIdentifier === "sourceVersionKey" &&
        /unique/i.test(error?.message || "")
    )
  );
}

export async function persistFinancialEventOnce({ saveRecord, findExisting }) {
  try {
    return { created: true, record: await saveRecord() };
  } catch (reason) {
    if (!hasSourceVersionKeyUniqueViolation(reason)) throw reason;
    const record = await findExisting();
    if (!record) throw new Error("financial event conflict could not be resolved");
    return { created: false, record };
  }
}

const JOURNAL_REPLAY_FIELDS = Object.freeze([
  "sourceVersionKey",
  "accountingEntityId",
  "accountingPeriodId",
  "currency",
  "sourceSystem",
  "sourceId",
  "sourceVersion",
  "financialEventId",
  "shadowMode",
]);

function sameJournalReplay(existing, expected) {
  return JOURNAL_REPLAY_FIELDS.every((field) => {
    const left = existing?.[field];
    const right = expected?.[field];
    return typeof right === "boolean"
      ? left === right
      : String(left ?? "") === String(right ?? "");
  });
}

export async function persistJournalEntryOnce({
  saveRecord,
  findExisting,
  expected,
}) {
  try {
    return { created: true, record: await saveRecord() };
  } catch (reason) {
    if (!hasSourceVersionKeyUniqueViolation(reason)) throw reason;
    const record = await findExisting();
    if (!record || !sameJournalReplay(record, expected)) {
      const error = new Error("journal source-version idempotency conflict");
      error.statusCode = 409;
      throw error;
    }
    return { created: false, record };
  }
}

export async function persistClaimedFinanceMutation({
  claim,
  mutate,
  audit,
  complete,
  duplicate,
}) {
  const operation = await claim();
  if (!operation.claimed) {
    return duplicate ? duplicate(operation.receipt) : { idempotent: true };
  }
  const result = await mutate(operation.receipt);
  await audit(result, operation.receipt);
  await complete(result, operation.receipt);
  return result;
}

export async function claimFinanceOperation(
  api,
  { journalEntryId, accountingEntityId, operation, actorId }
) {
  const operationKey = deriveFinanceOperationKey(journalEntryId, operation);
  try {
    const receipt = await api.internal.financeOperationReceipt.create({
      operationKey,
      accountingEntity: { _link: keyPart(accountingEntityId, "accountingEntityId") },
      journalEntry: { _link: keyPart(journalEntryId, "journalEntryId") },
      operation,
      actorId: keyPart(actorId, "actorId"),
      status: "claimed",
    });
    return { claimed: true, receipt };
  } catch (reason) {
    if (!hasOperationKeyUniqueViolation(reason)) throw reason;
    const receipt = await api.financeOperationReceipt.findFirst({
      filter: {
        AND: [
          { operationKey: { equals: operationKey } },
          { accountingEntityId: { equals: accountingEntityId } },
        ],
      },
      select: {
        id: true,
        operationKey: true,
        status: true,
        resultJournalEntryId: true,
      },
    });
    if (!receipt) throw new Error("finance operation receipt conflict could not be resolved");
    return { claimed: false, receipt };
  }
}

export async function completeFinanceOperation(api, receiptId, resultJournalEntryId) {
  return api.internal.financeOperationReceipt.update(receiptId, {
    status: "completed",
    resultJournalEntry: { _link: String(resultJournalEntryId) },
    completedAt: new Date().toISOString(),
  });
}

export async function claimOperationalOperation(api, {
  operationKey, accountingEntityId, operation, actorId, resultRecordId,
}) {
  const key = operationKeyPart(operationKey);
  try {
    const receipt = await api.internal.financeOperationReceipt.create({
      operationKey: key,
      accountingEntity: { _link: keyPart(accountingEntityId, "accountingEntityId") },
      operation,
      actorId: keyPart(actorId, "actorId"),
      status: "claimed",
      resultRecordId: resultRecordId ? String(resultRecordId) : undefined,
    });
    return { claimed: true, receipt };
  } catch (reason) {
    if (!hasOperationKeyUniqueViolation(reason)) throw reason;
    const receipt = await api.financeOperationReceipt.findFirst({
      filter: {
        AND: [
          { operationKey: { equals: key } },
          { accountingEntityId: { equals: String(accountingEntityId) } },
        ],
      },
      select: { id: true, operationKey: true, status: true, resultRecordId: true },
    });
    if (!receipt) {
      const conflict = new Error("finance operation receipt conflict could not be resolved");
      conflict.statusCode = 409;
      throw conflict;
    }
    return { claimed: false, receipt };
  }
}

export async function completeOperationalOperation(api, receiptId, resultRecordId) {
  return api.internal.financeOperationReceipt.update(receiptId, {
    status: "completed",
    resultRecordId: String(resultRecordId),
    completedAt: new Date().toISOString(),
  });
}

export async function claimDocumentBalance(api, {
  documentId, openAmountMinor, accountingEntityId, actorId,
}) {
  const operationKey = `balance:${keyPart(documentId, "documentId")}:${String(openAmountMinor)}`;
  try {
    return await api.internal.financeOperationReceipt.create({
      operationKey,
      accountingEntity: { _link: keyPart(accountingEntityId, "accountingEntityId") },
      operation: "document_balance",
      actorId: keyPart(actorId, "actorId"),
      status: "claimed",
      resultRecordId: String(documentId),
    });
  } catch (reason) {
    if (!hasOperationKeyUniqueViolation(reason)) throw reason;
    const conflict = new Error("document balance changed; reload and retry");
    conflict.statusCode = 409;
    throw conflict;
  }
}

export async function claimRecordRevision(api, {
  recordType, recordId, revision, accountingEntityId, actorId,
}) {
  const type = keyPart(recordType, "recordType");
  const id = keyPart(recordId, "recordId");
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new Error("revision must be a non-negative safe integer");
  }
  const operationKey = `revision:${type}:${id}:${revision}`;
  try {
    return await api.internal.financeOperationReceipt.create({
      operationKey,
      accountingEntity: { _link: keyPart(accountingEntityId, "accountingEntityId") },
      operation: "record_revision",
      actorId: keyPart(actorId, "actorId"),
      status: "claimed",
      resultRecordId: id,
    });
  } catch (reason) {
    if (!hasOperationKeyUniqueViolation(reason)) throw reason;
    const conflict = new Error("record revision changed; reload and retry");
    conflict.statusCode = 409;
    throw conflict;
  }
}
