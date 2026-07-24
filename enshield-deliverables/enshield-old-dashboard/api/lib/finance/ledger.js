const ISO_CURRENCY = /^[A-Z]{3}$/;
const ISO_CURRENCIES = new Set(Intl.supportedValuesOf("currency"));

function requiredString(value, name) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${name} is required`);
  if (normalized.includes(":")) throw new Error(`${name} cannot contain ':'`);
  return normalized;
}

function nonEmptyString(value, name) {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

export function assertMinorUnits(value, name = "amountMinor") {
  if (!Number.isInteger(value)) throw new Error(`${name} must use integer minor units`);
  if (!Number.isSafeInteger(value)) throw new Error(`${name} must be a safe integer`);
  return value;
}

export function normalizeCurrency(value) {
  const currency = typeof value === "string" ? value.trim().toUpperCase() : "";
  if (!ISO_CURRENCY.test(currency) || !ISO_CURRENCIES.has(currency)) {
    throw new Error("currency must be a valid ISO 4217 code");
  }
  return currency;
}

export function buildSourceVersionKey(input) {
  return [
    requiredString(input?.accountingEntityId, "accountingEntityId"),
    requiredString(input?.sourceSystem, "sourceSystem"),
    requiredString(input?.sourceId, "sourceId"),
    requiredString(input?.sourceVersion, "sourceVersion"),
  ].join(":");
}

export function normalizeFinancialEvent(input) {
  const normalized = {
    accountingEntityId: requiredString(input?.accountingEntityId, "accountingEntityId"),
    sourceSystem: requiredString(input?.sourceSystem, "sourceSystem"),
    sourceId: requiredString(input?.sourceId, "sourceId"),
    sourceVersion: requiredString(input?.sourceVersion, "sourceVersion"),
    currency: normalizeCurrency(input?.currency),
    amountMinor: assertMinorUnits(input?.amountMinor),
  };
  return {
    ...normalized,
    sourceVersionKey: buildSourceVersionKey(normalized),
    currency: normalized.currency,
    amountMinor: normalized.amountMinor,
  };
}

export function sanitizeFinancialMetadata(input) {
  const metadata = {};
  for (const key of ["orderId", "claimId", "eventCategory"]) {
    const value = input?.[key];
    if (typeof value === "string" && /^[A-Za-z0-9._|~-]{1,128}$/.test(value)) {
      metadata[key] = value;
    }
  }
  return metadata;
}

export function validateJournal({ accountingEntityId, currency, lines }) {
  const entityId = requiredString(accountingEntityId, "accountingEntityId");
  const journalCurrency = normalizeCurrency(currency);
  if (!Array.isArray(lines) || lines.length < 2) {
    throw new Error("journal requires at least two lines");
  }

  let debitMinor = 0;
  let creditMinor = 0;
  for (const line of lines) {
    if (String(line.accountingEntityId) !== entityId) {
      throw new Error("all lines must belong to the journal accounting entity");
    }
    if (normalizeCurrency(line.currency) !== journalCurrency) {
      throw new Error("cross-currency journal lines are forbidden");
    }
    const debit = assertMinorUnits(line.debitMinor ?? 0, "debitMinor");
    const credit = assertMinorUnits(line.creditMinor ?? 0, "creditMinor");
    if (!((debit > 0 && credit === 0) || (credit > 0 && debit === 0))) {
      throw new Error("each journal line must have exactly one positive debit or credit");
    }
    debitMinor += debit;
    creditMinor += credit;
    if (!Number.isSafeInteger(debitMinor) || !Number.isSafeInteger(creditMinor)) {
      throw new Error("journal totals must be safe integers");
    }
  }
  if (debitMinor !== creditMinor) throw new Error("journal must be balanced");
  return { currency: journalCurrency, debitMinor, creditMinor };
}

export function assertPeriodOpen(period) {
  if (period?.status !== "open") throw new Error("accounting period is closed");
  return period;
}

export function assertApprovalSeparation({ preparedById, approvedById }) {
  const preparer = requiredString(preparedById, "preparedById");
  const approver = requiredString(approvedById, "approvedById");
  if (preparer === approver) throw new Error("approver must be a different operator");
  return true;
}

export function assertShadowMode(value) {
  if (value !== true) throw new Error("finance records must remain in shadow mode");
  return true;
}

export function assertImmutablePostedUpdate(record, input) {
  if (record?.status === "posted" && input && Object.keys(input).length > 0) {
    throw new Error("posted journal entries are immutable; create a linked reversal");
  }
}

function assertEntityAndPeriod(entry, period) {
  if (String(entry.accountingEntityId) !== String(period?.accountingEntityId)) {
    throw new Error("accounting period must belong to the journal accounting entity");
  }
  if (String(entry.accountingPeriodId) !== String(period?.id)) {
    throw new Error("journal accounting period mismatch");
  }
}

export function submitJournal({ entry, lines }) {
  if (entry?.status !== "draft") throw new Error("only a draft journal can be submitted");
  assertShadowMode(entry.shadowMode);
  validateJournal({
    accountingEntityId: entry.accountingEntityId,
    currency: entry.currency,
    lines,
  });
  return { ...entry, status: "pending_approval" };
}

export function approveJournal({ entry, lines, period, actorId, now = new Date().toISOString() }) {
  if (entry?.status !== "pending_approval") {
    throw new Error("only a pending journal can be approved");
  }
  assertShadowMode(entry.shadowMode);
  assertEntityAndPeriod(entry, period);
  assertPeriodOpen(period);
  assertApprovalSeparation({ preparedById: entry.preparedBy, approvedById: actorId });
  validateJournal({
    accountingEntityId: entry.accountingEntityId,
    currency: entry.currency,
    lines,
  });
  return { ...entry, status: "approved", approvedBy: actorId, approvedAt: now };
}

export function postJournal({ entry, lines, period, actorId, now = new Date().toISOString() }) {
  if (entry?.status !== "approved") throw new Error("only an approved journal can be posted");
  assertShadowMode(entry.shadowMode);
  assertEntityAndPeriod(entry, period);
  assertPeriodOpen(period);
  assertApprovalSeparation({ preparedById: entry.preparedBy, approvedById: entry.approvedBy });
  validateJournal({
    accountingEntityId: entry.accountingEntityId,
    currency: entry.currency,
    lines,
  });
  return { ...entry, status: "posted", postedBy: requiredString(actorId, "actorId"), postedAt: now };
}

export function createReversalDraft(original, { sourceVersionKey, actorId }) {
  if (original?.status !== "posted") throw new Error("only a posted journal can be reversed");
  nonEmptyString(sourceVersionKey, "sourceVersionKey");
  requiredString(actorId, "actorId");
  const currency = normalizeCurrency(original.currency);
  const accountingEntityId = requiredString(
    original.accountingEntityId,
    "accountingEntityId"
  );
  const lines = (original.lines || []).map((line) => ({
    accountingEntityId,
    ledgerAccountId: line.ledgerAccountId,
    currency,
    debitMinor: assertMinorUnits(line.creditMinor ?? 0),
    creditMinor: assertMinorUnits(line.debitMinor ?? 0),
  }));
  validateJournal({ accountingEntityId, currency, lines });
  return {
    accountingEntityId,
    sourceVersionKey,
    currency,
    status: "draft",
    shadowMode: true,
    preparedById: actorId,
    reversesJournalEntryId: String(original.id),
    lines,
  };
}
