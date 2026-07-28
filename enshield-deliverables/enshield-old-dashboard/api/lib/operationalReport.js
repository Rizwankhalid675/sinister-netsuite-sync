import { money } from "./money.js";
import { aggregateWindow, deriveMetrics, normalizeRange, priorWindowFor, rangeStartFor } from "./metrics.js";

const CLOSED_CLAIM_STATUSES = new Set(["closed", "paid", "denied", "cancelled", "canceled"]);

export function buildOperationalReport(orders = [], claims = [], options = {}) {
  const now = options.now || new Date();
  const year = Number(options.year) || now.getFullYear();
  const range = normalizeRange(options.range);
  const start = rangeStartFor(range, now);
  const priorWindow = priorWindowFor(start, now);
  const current = aggregateWindow(orders, start, { now, rate: options.rate || 0 });
  const prior = priorWindow
    ? aggregateWindow(orders, priorWindow.start, { now: priorWindow.end, endExclusive: true, rate: options.rate || 0 })
    : null;
  const activity = Array.from({ length: 12 }, (_, month) => ({ month, orders: 0, value: 0 }));
  const sourceSplits = {};
  for (const order of orders) {
    const created = order?.shopifyCreatedAt ? new Date(order.shopifyCreatedAt) : null;
    if (created && created.getFullYear() === year) {
      const bucket = activity[created.getMonth()];
      bucket.orders += 1;
      bucket.value += money(order.currentTotalPriceSet);
    }
    const source = String(order?.source || "shopify").toLowerCase();
    sourceSplits[source] = (sourceSplits[source] || 0) + 1;
  }
  const openClaims = claims.filter((claim) => !CLOSED_CLAIM_STATUSES.has(String(claim?.status || "").toLowerCase())).length;
  const metrics = deriveMetrics(current, prior);
  return {
    year,
    range,
    generatedAt: now.toISOString(),
    activity,
    sourceSplits,
    summary: { ...current, openClaims },
    ...metrics,
  };
}
