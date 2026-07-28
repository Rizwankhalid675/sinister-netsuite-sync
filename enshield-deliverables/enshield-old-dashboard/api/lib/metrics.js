// Dashboard metrics: order predicates, range windows, and aggregation.
// Extracted from api/routes/api/GET-dashboard-metrics.js so the route stays a
// thin handler and this logic is unit-testable in isolation.
//
// SINGLE-SHOP scope: callers pass an already-fetched, already-scoped order
// array (access-control .gelly filters bind every read to $session.shopId).
// Nothing here queries — it's pure functions over plain order objects.

import { money, pct, delta } from "./money.js";
import {
  getProtectionPriceSnapshot,
  hasEnshieldProtection,
  isProtectionEligible,
  minorUnitForCurrency,
} from "./protection.js";

// If a range fetch hits this many orders we treat the aggregate as partial.
export const ORDER_CAP = 5000;

// Named range windows in days. ytd/all are handled specially in rangeStartFor.
export const RANGES = { "7d": 7, "30d": 30, "90d": 90 };

// ---------------------------------------------------------------------------
// Order predicates. Each takes a single Shopify order object.
// ---------------------------------------------------------------------------

/** True when the order carries Enshield shipping protection. */
export const isProtected = (o) => isProtectionEligible(o);

/**
 * In-transit = not yet delivered and not unwound. Excludes fulfilled/restocked
 * fulfilment states and refunded/voided financial states. Drives valueInTransit.
 */
export const inTransit = (o) =>
  o.fulfillmentStatus !== "fulfilled" &&
  o.fulfillmentStatus !== "restocked" &&
  o.financialStatus !== "refunded" &&
  o.financialStatus !== "voided";

/** True when the order was cancelled (cancelledAt stamped). */
export const isCancelled = (o) => Boolean(o.cancelledAt);

/**
 * Refunded = explicit refunded/partially_refunded financial status, OR a
 * non-zero totalRefundedSet money bag (partial refunds without a status flip).
 */
export const isRefunded = (o) =>
  o.financialStatus === "refunded" ||
  o.financialStatus === "partially_refunded" ||
  money(o.totalRefundedSet) > 0;

/** Returned or a return in progress. */
export const isReturned = (o) =>
  o.returnStatus === "returned" || o.returnStatus === "in_progress";

/** Fully fulfilled. */
export const isFulfilled = (o) => o.fulfillmentStatus === "fulfilled";

// ---------------------------------------------------------------------------
// Range windows.
// ---------------------------------------------------------------------------

/**
 * Normalise a raw ?range= query value to one of: 7d|30d|90d|ytd|all.
 * Anything unrecognised falls back to "30d".
 * @param {string|undefined} raw
 * @returns {string}
 */
export function normalizeRange(raw) {
  const r = String(raw || "30d").toLowerCase();
  return r in RANGES || r === "ytd" || r === "all" ? r : "30d";
}

/**
 * The inclusive lower bound for a range, relative to `now`.
 * Returns null for "all" (no lower bound). ytd = Jan 1 of now's year.
 * @param {string} range - normalised range
 * @param {Date} now
 * @returns {Date|null}
 */
export function rangeStartFor(range, now = new Date()) {
  if (range === "all") return null;
  if (range === "ytd") return new Date(now.getFullYear(), 0, 1);
  const d = new Date(now);
  d.setDate(d.getDate() - RANGES[range]);
  return d;
}

/**
 * The matching prior window immediately preceding [start, now], used for
 * period-over-period deltas. Returns { start, end } or null for "all"/no-start.
 * @param {Date|null} start - current window start (from rangeStartFor)
 * @param {Date} now
 * @returns {{start: Date, end: Date}|null}
 */
export function priorWindowFor(start, now = new Date()) {
  if (!start) return null;
  const span = now.getTime() - start.getTime();
  return { start: new Date(start.getTime() - span), end: start };
}

/**
 * True when order o falls within the window bounded by start and end.
 * A null start means "all time" (always in range). Orders with no createdAt
 * are excluded from bounded ranges.
 *
 * The lower bound is always inclusive (t >= start). The upper bound is
 * inclusive by default (t <= end) for the current window, but callers can pass
 * endExclusive=true (t < end) for the PRIOR window so an order created exactly
 * at the boundary is not double-counted in both windows — matching the tested
 * route's `d >= priorStart && d < rangeStart`.
 *
 * @param {object} o
 * @param {Date|null} start
 * @param {Date} end
 * @param {boolean} [endExclusive=false]
 * @returns {boolean}
 */
export function inRange(o, start, end = new Date(), endExclusive = false) {
  if (!start) return true;
  if (!o.shopifyCreatedAt) return false;
  const t = new Date(o.shopifyCreatedAt).getTime();
  const e = end.getTime();
  return t >= start.getTime() && (endExclusive ? t < e : t <= e);
}

// ---------------------------------------------------------------------------
// Aggregation.
// ---------------------------------------------------------------------------

/**
 * Reduce an order array over a window into the raw sums the derived metrics
 * need. Pass start=null for all-time. Revenue uses currentTotalPriceSet.
 *
 * @param {object[]} orders
 * @param {Date|null} start
 * @param {object} [opts]
 * @param {number|string} [opts.rate=0] - insurance rate as a percentage.
 * @param {number|string} [opts.baseAmount=0] - fixed base amount in major units.
 * @param {Date} [opts.now] - upper bound of the window.
 * @param {boolean} [opts.endExclusive=false] - use t < now (prior window) so a
 *   boundary order is not counted in both the current and prior windows.
 */
export function aggregateWindow(orders, start, opts = {}) {
  const { rate = 0, baseAmount = 0, now = new Date(), endExclusive = false } = opts;
  const acc = {
    orders: 0,
    revenue: 0,
    protectedOrders: 0,
    activeProtectedOrders: 0,
    insuranceRevenue: 0,
    refundedOrders: 0,
    refundedAmount: 0,
    returnedOrders: 0,
    fulfilledOrders: 0,
    inTransitOrders: 0,
    valueInTransit: 0,
    cancelledOrders: 0,
  };
  for (const o of orders) {
    if (!inRange(o, start, now, endExclusive)) continue;
    const total = money(o.currentTotalPriceSet);
    acc.orders += 1;
    acc.revenue += total;
    if (hasEnshieldProtection(o)) {
      acc.protectedOrders += 1;
      const snapshot = getProtectionPriceSnapshot(o);
      if (snapshot) {
        const units = minorUnitForCurrency(snapshot.currency);
        acc.insuranceRevenue += snapshot.amountMinor / (10 ** units);
      }
    }
    if (isProtected(o)) acc.activeProtectedOrders += 1;
    if (isRefunded(o)) {
      acc.refundedOrders += 1;
      // Fall back to order total when the refunded bag is zero (partial/edge).
      acc.refundedAmount += money(o.totalRefundedSet) || total;
    }
    if (isReturned(o)) acc.returnedOrders += 1;
    if (isFulfilled(o)) acc.fulfilledOrders += 1;
    if (inTransit(o)) {
      acc.inTransitOrders += 1;
      acc.valueInTransit += total;
    }
    if (isCancelled(o)) acc.cancelledOrders += 1;
  }
  return acc;
}

/**
 * Build the derived metric groups (insurance, refunds/returns, revenue trend,
 * fulfilment health) from a current-window aggregate and its prior-window
 * counterpart. Prior may be null (all-time) — deltas then come back null.
 * @param {ReturnType<typeof aggregateWindow>} cur
 * @param {ReturnType<typeof aggregateWindow>|null} prior
 */
export function deriveMetrics(cur, prior) {
  const aov = cur.orders > 0 ? cur.revenue / cur.orders : 0;
  const priorAov = prior && prior.orders > 0 ? prior.revenue / prior.orders : 0;

  return {
    insuranceMetrics: {
      revenue: cur.insuranceRevenue,
      attachRate: pct(cur.protectedOrders, cur.orders),
      protectedOrders: cur.protectedOrders,
      activeProtectedOrders: cur.activeProtectedOrders,
    },
    refundsReturns: {
      refundedOrders: cur.refundedOrders,
      refundedAmount: cur.refundedAmount,
      refundRate: pct(cur.refundedOrders, cur.orders),
      returnedOrders: cur.returnedOrders,
      returnRate: pct(cur.returnedOrders, cur.orders),
    },
    revenueTrend: {
      revenue: cur.revenue,
      revenueDelta: prior ? delta(cur.revenue, prior.revenue) : null,
      aov,
      aovDelta: prior ? delta(aov, priorAov) : null,
      orders: cur.orders,
      ordersDelta: prior ? delta(cur.orders, prior.orders) : null,
    },
    fulfillmentHealth: {
      fulfilledOrders: cur.fulfilledOrders,
      fulfillmentRate: pct(cur.fulfilledOrders, cur.orders),
      inTransitOrders: cur.inTransitOrders,
      cancelledOrders: cur.cancelledOrders,
      cancelRate: pct(cur.cancelledOrders, cur.orders),
    },
  };
}
