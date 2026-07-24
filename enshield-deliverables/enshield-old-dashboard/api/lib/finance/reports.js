import { assertMinorUnits, normalizeCurrency } from "./ledger.js";
import { calculateReserveRollForward } from "./operationalFinance.js";

function bounded(rows, limit = 1000) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 10000) throw new Error("report limit must be 1-10000");
  return rows.slice(0, limit);
}

function safeAdd(left, right, name) {
  const total = left + right;
  if (!Number.isSafeInteger(total)) throw new Error(`${name} total must be a safe integer`);
  return total;
}

export async function loadBoundedFinanceRows(
  loadPage,
  { pageSize = 250, maxRecords = 10000 } = {}
) {
  if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 250) throw new Error("invalid page size");
  if (!Number.isInteger(maxRecords) || maxRecords < 1 || maxRecords > 10000) throw new Error("invalid safety limit");
  const rows = [];
  let after;
  do {
    const page = await loadPage({ first: pageSize, after });
    if (!Array.isArray(page)) throw new Error("invalid finance report page");
    if (rows.length + page.length > maxRecords) throw new Error("finance report safety limit exceeded");
    rows.push(...page);
    if (!page.hasNextPage) break;
    if (!page.endCursor || page.endCursor === after) throw new Error("invalid finance report cursor");
    after = page.endCursor;
  } while (true);
  return rows;
}

export function normalizeReportPeriod({ from, to } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from || "") || !Number.isFinite(Date.parse(`${from}T00:00:00Z`))) {
    throw new Error("valid report from date is required");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(to || "") || !Number.isFinite(Date.parse(`${to}T00:00:00Z`))) {
    throw new Error("valid report to date is required");
  }
  const start = Date.parse(`${from}T00:00:00.000Z`);
  const end = Date.parse(`${to}T23:59:59.999Z`);
  if (start > end) throw new Error("report dates must be ordered");
  return { from: new Date(start).toISOString(), to: new Date(end).toISOString() };
}

export function buildTrialBalance(lines) {
  const groups = new Map();
  for (const line of lines) {
    const currency = normalizeCurrency(line.currency);
    const key = `${line.accountCode}:${currency}`;
    const value = groups.get(key) || { accountCode: String(line.accountCode), currency, debitMinor: 0, creditMinor: 0 };
    value.debitMinor = safeAdd(value.debitMinor, assertMinorUnits(line.debitMinor || 0, "debitMinor"), "debitMinor");
    value.creditMinor = safeAdd(value.creditMinor, assertMinorUnits(line.creditMinor || 0, "creditMinor"), "creditMinor");
    groups.set(key, value);
  }
  return [...groups.values()]
    .map((row) => ({ ...row, balanceMinor: row.debitMinor - row.creditMinor }))
    .sort((a, b) => a.currency.localeCompare(b.currency) || a.accountCode.localeCompare(b.accountCode));
}

export function buildLedgerDetail(lines, options = {}) {
  return bounded([...lines].sort((a, b) =>
    String(a.accountingDate).localeCompare(String(b.accountingDate)) || String(a.id).localeCompare(String(b.id))
  ), options.limit);
}

export function buildAgeing(documents, asOfDate) {
  const asOf = Date.parse(`${asOfDate}T00:00:00Z`);
  if (!Number.isFinite(asOf)) throw new Error("valid asOfDate is required");
  const result = { currentMinor: 0, days1To30Minor: 0, days31To60Minor: 0, days61To90Minor: 0, over90Minor: 0 };
  for (const row of documents) {
    const amount = assertMinorUnits(row.openAmountMinor, "openAmountMinor");
    const due = row.dueAt == null || row.dueAt === "" ? asOf : Date.parse(`${row.dueAt}T00:00:00Z`);
    if (!Number.isFinite(due)) throw new Error("valid dueAt is required when provided");
    const days = Math.floor((asOf - due) / 86400000);
    const key = days <= 0 ? "currentMinor" : days <= 30 ? "days1To30Minor" : days <= 60 ? "days31To60Minor" : days <= 90 ? "days61To90Minor" : "over90Minor";
    result[key] = safeAdd(result[key], amount, key);
  }
  return result;
}

export function buildAgeingByCurrency(documents, asOfDate) {
  const groups = new Map();
  for (const document of documents) {
    const currency = normalizeCurrency(document.currency);
    if (!groups.has(currency)) groups.set(currency, []);
    groups.get(currency).push(document);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, rows]) => ({ currency, ...buildAgeing(rows, asOfDate) }));
}

export function reconstructOpenDocumentsAsOf(documents, allocations, payments, asOf) {
  const effective = Date.parse(asOf);
  if (!Number.isFinite(effective)) throw new Error("valid ageing effective date is required");
  const allocated = new Map();
  for (const row of allocations) {
    const at = Date.parse(row.effectiveAt || row.createdAt);
    if (!Number.isFinite(at) || at > effective) continue;
    const id = String(row.documentId);
    allocated.set(id, safeAdd(allocated.get(id) || 0, assertMinorUnits(row.amountMinor, "amountMinor"), "allocatedMinor"));
  }
  const paid = new Map();
  for (const row of payments) {
    const at = Date.parse(row.verifiedAt);
    if (row.status !== "verified" || !Number.isFinite(at) || at > effective) continue;
    const id = String(row.documentId);
    paid.set(id, safeAdd(paid.get(id) || 0, assertMinorUnits(row.amountMinor, "amountMinor"), "paidMinor"));
  }
  return documents.filter((row) =>
    !["draft", "void"].includes(row.status) && Date.parse(row.createdAt) <= effective
  ).map((row) => {
    const amount = assertMinorUnits(row.amountMinor, "amountMinor");
    const openAmountMinor = amount - (allocated.get(String(row.id)) || 0) - (paid.get(String(row.id)) || 0);
    if (!Number.isSafeInteger(openAmountMinor) || openAmountMinor < 0) throw new Error("historical settlement exceeds document amount");
    return { ...row, openAmountMinor };
  }).filter((row) => row.openAmountMinor > 0);
}

export function buildReserveRollForward(rows) {
  const totals = rows.reduce((out, row) => {
    for (const field of ["openingMinor", "additionsMinor", "releasesMinor", "paymentsMinor"]) {
      out[field] = safeAdd(out[field], assertMinorUnits(row[field] || 0, field), field);
    }
    return out;
  }, { openingMinor: 0, additionsMinor: 0, releasesMinor: 0, paymentsMinor: 0 });
  return { ...totals, closingMinor: calculateReserveRollForward(totals) };
}

export function buildReserveRollForwardByCurrency(rows) {
  const groups = new Map();
  for (const row of rows) {
    const currency = normalizeCurrency(row.currency);
    if (!groups.has(currency)) groups.set(currency, []);
    groups.get(currency).push(row);
  }
  return [...groups.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([currency, values]) => ({ currency, ...buildReserveRollForward(values) }));
}

export function buildReserveMovementRollForwardByCurrency(movements, { from, to }) {
  const start = Date.parse(from);
  const end = Date.parse(to);
  if (!Number.isFinite(start) || !Number.isFinite(end) || start > end) throw new Error("valid reserve report period is required");
  const groups = new Map();
  for (const row of movements) {
    const currency = normalizeCurrency(row.currency);
    const effective = Date.parse(row.effectiveAt);
    if (!Number.isFinite(effective) || effective > end) continue;
    const values = groups.get(currency) || { currency, openingMinor: 0, additionsMinor: 0, releasesMinor: 0, paymentsMinor: 0 };
    const amount = assertMinorUnits(row.amountMinor, "amountMinor");
    if (effective < start) {
      values.openingMinor = safeAdd(values.openingMinor,
        row.movementType === "release" || row.movementType === "payment" ? -amount : amount,
        "openingMinor");
    } else {
      const field = row.movementType === "addition" || row.movementType === "opening"
        ? "additionsMinor" : row.movementType === "release" ? "releasesMinor" : "paymentsMinor";
      values[field] = safeAdd(values[field], amount, field);
    }
    groups.set(currency, values);
  }
  return [...groups.values()].sort((a, b) => a.currency.localeCompare(b.currency))
    .map((row) => ({ ...row, closingMinor: calculateReserveRollForward(row) }));
}

export function buildPaymentRegister(payments) {
  if (payments.some((row) => row.initiatedBySystem !== false)) {
    throw new Error("system-initiated payments are forbidden");
  }
  return payments.filter((row) => row.status === "verified" && Number.isFinite(Date.parse(row.verifiedAt)))
    .sort((a, b) => String(a.verifiedAt).localeCompare(String(b.verifiedAt)) || String(a.id).localeCompare(String(b.id)));
}

export function buildReconciliationExceptions(items) {
  return items.filter((row) => row.status === "exception");
}

export function buildAuditExport(records) {
  return records.map(({ id, action, actorId, createdAt, resourceType, resourceId, entityType, entityId }) => ({
    id, action, actorId, createdAt,
    resourceType: resourceType ?? entityType,
    resourceId: resourceId ?? entityId,
  })).map((row) => Object.fromEntries(Object.entries(row).filter(([, value]) => value !== undefined)));
}
