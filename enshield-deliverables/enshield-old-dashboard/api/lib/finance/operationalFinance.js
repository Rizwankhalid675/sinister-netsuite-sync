import {
  assertApprovalSeparation,
  assertMinorUnits,
  assertShadowMode,
  normalizeCurrency,
} from "./ledger.js";

function required(value, name) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result || result.includes(":")) throw new Error(`${name} is required and cannot contain ':'`);
  return result;
}

function opaqueKey(value, name) {
  const result = typeof value === "string" ? value.trim() : "";
  if (!result) throw new Error(`${name} is required`);
  return result;
}

function nonNegative(value, name) {
  assertMinorUnits(value, name);
  if (value < 0) throw new Error(`${name} cannot be negative`);
  return value;
}

export function buildOperationKey(accountingEntityId, operation, sourceId) {
  return `${required(accountingEntityId, "accountingEntityId")}:${required(operation, "operation")}:${required(sourceId, "sourceId")}`;
}

export async function persistOperationalRecordOnce({
  saveRecord,
  findExisting,
  keyField,
  expectedKey,
}) {
  try {
    return { created: true, record: await saveRecord() };
  } catch (error) {
    const unique = error?.name === "InvalidRecordError" &&
      error?.code === "GGT_INVALID_RECORD" &&
      Array.isArray(error?.validationErrors) &&
      error.validationErrors.some((item) =>
        item?.apiIdentifier === keyField && /unique/i.test(item?.message || "")
      );
    if (!unique) throw error;
    const record = await findExisting();
    if (!record || String(record[keyField]) !== String(expectedKey)) {
      const conflict = new Error("operational idempotency conflict");
      conflict.statusCode = 409;
      throw conflict;
    }
    return { created: false, record };
  }
}

export function normalizeDocument(input) {
  const amountMinor = nonNegative(input?.amountMinor, "amountMinor");
  if (amountMinor === 0) throw new Error("amountMinor must be positive");
  return {
    kind: ["receivable", "payable"].includes(input?.kind) ? input.kind : (() => { throw new Error("kind is required"); })(),
    shopId: required(input?.shopId, "shopId"),
    accountingEntityId: required(input?.accountingEntityId, "accountingEntityId"),
    documentNumber: required(input?.documentNumber, "documentNumber"),
    operationKey: opaqueKey(input?.operationKey, "operationKey"),
    currency: normalizeCurrency(input?.currency),
    amountMinor,
    allocatedMinor: 0,
    openAmountMinor: amountMinor,
    status: "draft",
    shadowMode: true,
    preparedById: required(input?.preparedById, "preparedById"),
  };
}

export function approveDocument(document, actorId) {
  if (document?.status !== "draft") throw new Error("only draft documents may be approved");
  assertShadowMode(document.shadowMode);
  assertApprovalSeparation({ preparedById: document.preparedById, approvedById: actorId });
  return { ...document, status: "approved", approvedById: actorId };
}

export function allocateDocument(document, allocation) {
  if (["settled", "void"].includes(document?.status)) throw new Error("settled documents are immutable");
  if (document?.status !== "approved" && document?.status !== "partially_settled") {
    throw new Error("only approved documents may be allocated");
  }
  if (String(document.accountingEntityId) !== String(allocation?.accountingEntityId)) {
    throw new Error("allocation accounting entity mismatch");
  }
  if (normalizeCurrency(document.currency) !== normalizeCurrency(allocation?.currency)) {
    throw new Error("allocation currency mismatch");
  }
  const amountMinor = nonNegative(allocation?.amountMinor, "amountMinor");
  if (amountMinor === 0) throw new Error("allocation amount must be positive");
  const allocatedMinor = nonNegative(document.allocatedMinor || 0, "allocatedMinor");
  const openAmountMinor = nonNegative(document.amountMinor, "amountMinor") - allocatedMinor;
  if (amountMinor > openAmountMinor) throw new Error("allocation exceeds open amount");
  const nextOpen = openAmountMinor - amountMinor;
  return {
    ...document,
    allocatedMinor: allocatedMinor + amountMinor,
    openAmountMinor: nextOpen,
    status: nextOpen === 0 ? "settled" : "partially_settled",
  };
}

export function calculateReserveRollForward(input) {
  const opening = nonNegative(input?.openingMinor, "openingMinor");
  const additions = nonNegative(input?.additionsMinor, "additionsMinor");
  const releases = nonNegative(input?.releasesMinor, "releasesMinor");
  const payments = nonNegative(input?.paymentsMinor, "paymentsMinor");
  const closing = opening + additions - releases - payments;
  if (!Number.isSafeInteger(closing)) throw new Error("closing reserve must be a safe integer");
  if (closing < 0) throw new Error("negative closing reserve is forbidden");
  return closing;
}

export function recordExternalPayment(payable, confirmation) {
  if (!["approved", "partially_settled"].includes(payable?.status)) {
    throw new Error("payment requires an approved payable");
  }
  assertApprovalSeparation({
    preparedById: confirmation?.recordedById,
    approvedById: confirmation?.verifiedById,
  });
  required(confirmation?.externalReference, "externalReference");
  opaqueKey(confirmation?.operationKey, "operationKey");
  if (String(payable.accountingEntityId) !== String(confirmation.accountingEntityId)) {
    throw new Error("payment accounting entity mismatch");
  }
  if (normalizeCurrency(payable.currency) !== normalizeCurrency(confirmation.currency)) {
    throw new Error("payment currency mismatch");
  }
  const amountMinor = nonNegative(confirmation.amountMinor, "amountMinor");
  const remaining = payable.openAmountMinor != null
    ? nonNegative(payable.openAmountMinor, "openAmountMinor")
    : nonNegative(payable.amountMinor, "amountMinor") -
      nonNegative(payable.paidMinor || 0, "paidMinor");
  if (amountMinor <= 0 || amountMinor > remaining) {
    throw new Error("payment exceeds approved payable");
  }
  return {
    ...confirmation,
    currency: normalizeCurrency(confirmation.currency),
    amountMinor,
    initiatedBySystem: false,
    shadowMode: true,
    payableStatus: amountMinor === remaining ? "settled" : "partially_settled",
  };
}

export function reconcileExact(row, records) {
  const reference = required(row?.externalReference, "externalReference");
  const currency = normalizeCurrency(row?.currency);
  const amountMinor = assertMinorUnits(row?.amountMinor, "amountMinor");
  const matches = records.filter((record) =>
    record.externalReference === reference &&
    normalizeCurrency(record.currency) === currency &&
    record.amountMinor === amountMinor
  );
  return matches.length === 1
    ? { status: "matched", matchedRecordId: matches[0].id }
    : { status: "exception", reason: matches.length ? "ambiguous_exact_match" : "no_exact_match" };
}

export function reconcileRowsOneToOne(rows, records) {
  const consumed = new Set();
  return rows.map((row) => {
    const available = records.filter((record) => !consumed.has(String(record.id)));
    const result = reconcileExact(row, available);
    if (result.status === "matched") consumed.add(String(result.matchedRecordId));
    return {
      row,
      result: result.status === "matched"
        ? { ...result, evidenceCode: "exact_reference_currency_amount" }
        : result,
    };
  });
}

export function completeReconciliation(run) {
  if (run?.status !== "processing") throw new Error("only processing reconciliation can complete");
  if (!Number.isInteger(run.unresolvedCount) || run.unresolvedCount !== 0) {
    throw new Error("unresolved reconciliation exceptions block completion");
  }
  return { ...run, status: "completed" };
}

export function safeCsvCell(value) {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function parseCsvRows(text) {
  const rows = [];
  let row = [], cell = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') { cell += '"'; index += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n") {
      row.push(cell.replace(/\r$/, "")); rows.push(row); row = []; cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("unterminated quoted CSV cell");
  if (cell || row.length) { row.push(cell.replace(/\r$/, "")); rows.push(row); }
  return rows;
}

export function parseReconciliationCsv(input) {
  if (typeof input !== "string" || input.length > 2_000_000) {
    throw new Error("CSV size limit exceeded");
  }
  const rows = parseCsvRows(input);
  const headers = rows.shift()?.map((value) => value.trim()) || [];
  const requiredHeaders = ["externalReference", "amountMinor", "currency"];
  if (!requiredHeaders.every((header) => headers.includes(header))) {
    throw new Error("CSV required headers are externalReference, amountMinor, currency");
  }
  if (rows.length > 10_000) throw new Error("CSV row limit exceeded");
  return rows.filter((row) => row.some((cell) => cell.trim())).map((row, index) => {
    try {
      const value = Object.fromEntries(headers.map((header, column) => [header, row[column] ?? ""]));
      const amountMinor = Number(value.amountMinor);
      assertMinorUnits(amountMinor, "amountMinor");
      return {
        externalReference: required(value.externalReference, "externalReference"),
        amountMinor,
        currency: normalizeCurrency(value.currency),
        rowNumber: index + 2,
      };
    } catch (error) {
      throw new Error(`invalid CSV row ${index + 2}: ${error.message}`);
    }
  });
}
