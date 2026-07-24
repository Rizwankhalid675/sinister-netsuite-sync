// Claim status state machine — single source of truth.
// Imported by claim model actions (enforcement) AND by tests (verification),
// so the legal transitions can never diverge between the two.

/** All valid claim statuses (must match the enum in api/models/claim/schema.gadget.ts). */
export const CLAIM_STATUSES = [
  "Draft",
  "Submitted",
  "New",
  "Under Review",
  "Awaiting Customer",
  "Awaiting Merchant",
  "Awaiting Carrier",
  "Approved",
  "Partially Approved",
  "Denied",
  "Payment Pending",
  "Paid",
  "Closed",
  "Reopened",
  "Cancelled",
];

// Statuses from which a claim may still be cancelled (not yet paid/closed).
const CANCELLABLE = [
  "Draft",
  "Submitted",
  "New",
  "Under Review",
  "Awaiting Customer",
  "Awaiting Merchant",
  "Awaiting Carrier",
];

/**
 * Map of status -> array of statuses it may legally transition to.
 * Any transition not listed here is rejected.
 */
export const CLAIM_TRANSITIONS = {
  Draft: ["Submitted", "Cancelled"],
  Submitted: ["New", "Cancelled"],
  New: ["Under Review", "Cancelled"],
  "Under Review": [
    "Awaiting Customer",
    "Awaiting Merchant",
    "Awaiting Carrier",
    "Approved",
    "Partially Approved",
    "Denied",
    "Cancelled",
  ],
  "Awaiting Customer": ["Under Review", "Cancelled"],
  "Awaiting Merchant": ["Under Review", "Cancelled"],
  "Awaiting Carrier": ["Under Review", "Cancelled"],
  Approved: ["Payment Pending", "Reopened"],
  "Partially Approved": ["Payment Pending", "Reopened"],
  Denied: ["Reopened", "Closed"],
  "Payment Pending": ["Paid"],
  Paid: ["Closed"],
  Closed: ["Reopened"],
  Reopened: ["Under Review", "Cancelled"],
  Cancelled: [],
};

/** Returns true if `from` -> `to` is a legal transition (a no-op stay is always legal). */
export function isLegalTransition(from, to) {
  if (from === to) return true;
  if (!CLAIM_STATUSES.includes(to)) return false;
  const allowed = CLAIM_TRANSITIONS[from] || [];
  return allowed.includes(to);
}

/** Whether a claim in `from` may be cancelled. */
export function isCancellable(from) {
  return CANCELLABLE.includes(from);
}

/**
 * Throws an Error with a clear message if `from` -> `to` is illegal.
 * `newStatus` may equal `from` (no status change) — that is allowed.
 */
export function assertLegalTransition(from, to) {
  if (!isLegalTransition(from, to)) {
    const allowed = (CLAIM_TRANSITIONS[from] || []).join(", ") || "(none)";
    throw new Error(
      `Illegal claim status transition: "${from}" -> "${to}". ` +
        `Allowed from "${from}": ${allowed}.`
    );
  }
}
