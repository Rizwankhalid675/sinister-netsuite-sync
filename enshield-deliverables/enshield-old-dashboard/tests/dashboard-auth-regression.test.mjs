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
  assert.match(dashboardSource, /const owner = metrics\?\.shop\?/);
  assert.doesNotMatch(dashboardSource, /const owner = shop\?/);
});

test("dashboard metrics route contains no temporary order-data diagnostics", () => {
  assert.doesNotMatch(metricsRouteSource, /TEMP DEBUG|metrics-debug/);
});
