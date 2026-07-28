import assert from "node:assert/strict";
import test from "node:test";
import { buildOperationalReport } from "../api/lib/operationalReport.js";

const order = (id, amount, createdAt, extra = {}) => ({
  id,
  name: `#${id}`,
  shopifyCreatedAt: createdAt,
  financialStatus: "paid",
  fulfillmentStatus: "unfulfilled",
  currentTotalPriceSet: { shopMoney: { amount: String(amount), currencyCode: "USD" } },
  totalRefundedSet: { shopMoney: { amount: "0", currencyCode: "USD" } },
  noteAttributes: [],
  ...extra,
});

test("dashboard and reports share one deterministic operational aggregate", () => {
  const orders = [order("1", 100, "2026-01-15T00:00:00Z"), order("2", 50, "2026-02-15T00:00:00Z", { fulfillmentStatus: "fulfilled" })];
  const report = buildOperationalReport(orders, [{ status: "open" }, { status: "closed" }], {
    range: "all", year: 2026, now: new Date("2026-07-27T00:00:00Z"),
  });
  assert.equal(report.summary.revenue, 150);
  assert.equal(report.summary.valueInTransit, 100);
  assert.equal(report.summary.openClaims, 1);
  assert.deepEqual(report.activity.slice(0, 2), [
    { month: 0, orders: 1, value: 100 },
    { month: 1, orders: 1, value: 50 },
  ]);
});
