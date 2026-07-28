import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dashboardSource = readFileSync(
  new URL("../web/routes/dashboard.jsx", import.meta.url),
  "utf8"
);
const metricsRouteSource = readFileSync(
  new URL("../api/routes/api/GET-dashboard-metrics.js", import.meta.url),
  "utf8"
);

test("dashboard uses its authenticated metrics payload for shop display data", () => {
  assert.doesNotMatch(dashboardSource, /useFindFirst\s*\(\s*api\.shopifyShop/);
  assert.match(dashboardSource, /metrics\?\.shop\?\.name/);
  assert.doesNotMatch(dashboardSource, /const owner = shop\?/);
});

test("dashboard metrics route contains no temporary order-data diagnostics", () => {
  assert.doesNotMatch(metricsRouteSource, /TEMP DEBUG|metrics-debug/);
});

test("dashboard reads one range-consistent KPI contract", () => {
  assert.match(dashboardSource, /revenueTrend\?\.revenue/);
  assert.match(dashboardSource, /revenueTrend\?\.revenueDelta/);
  assert.match(dashboardSource, /insuranceMetrics\?\.protectedOrders/);
  assert.doesNotMatch(dashboardSource, /rangeOrders\?\.protected/);
  assert.match(metricsRouteSource, /buildOperationalReport\(/);
  assert.match(metricsRouteSource, /valueInTransit:\s*operationalReport\.summary\.valueInTransit/);
});

test("dashboard displays backend percentage values without multiplying them again", () => {
  assert.match(dashboardSource, /function fmtPercentValue\(v\)/);
  assert.doesNotMatch(dashboardSource, /return `\$\{\(v \* 100\)\.toFixed\(1\)\}%`/);
  assert.match(dashboardSource, /fmtPercentValue\(metrics\?\.insuranceMetrics\?\.attachRate\)/);
  assert.match(dashboardSource, /fmtPercentValue\(metrics\?\.refundsReturns\?\.refundRate\)/);
});

test("dashboard distinguishes development Shopify from unavailable production reporting", () => {
  assert.match(metricsRouteSource, /dataSources:/);
  assert.match(metricsRouteSource, /miva:[\s\S]*status:\s*mivaOrderCount\s*>\s*0\s*\?\s*"live"\s*:\s*"unavailable"/);
  assert.match(dashboardSource, /Development Shopify connected/);
  assert.match(dashboardSource, /Production reporting API is not connected/);
  assert.match(dashboardSource, /Miva data is live/);
  assert.match(dashboardSource, /Miva data is not connected/);
});

test("dashboard is composed as an accessible insurance command center", () => {
  for (const component of ["SourceStatus", "MetricTile", "ActivityChart", "HealthPanel", "RecentOrders"]) {
    assert.match(dashboardSource, new RegExp(`function ${component}\\(`));
  }
  assert.match(dashboardSource, /aria-label="Dashboard metrics"/);
  assert.match(dashboardSource, /No records fall in this period/);
});
