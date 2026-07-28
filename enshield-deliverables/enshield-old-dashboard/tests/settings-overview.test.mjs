import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

const file = new URL("../api/routes/api/GET-settings-overview.js", import.meta.url);

test("settings uses a lightweight authorized metadata endpoint", () => {
  assert.equal(existsSync(file), true);
  const route = readFileSync(file, "utf8");
  assert.match(route, /PERMISSIONS\.MANAGE_SETTINGS/);
  assert.match(route, /requireInternalAccess/);
  assert.match(route, /shippingInsuranceSetting\.findMany/);
  assert.doesNotMatch(route, /shopifyOrder|legacyOrder|dashboard-metrics/);

  const page = readFileSync(new URL("../web/routes/internalSettings.jsx", import.meta.url), "utf8");
  assert.match(page, /\/api\/settings-overview/);
  assert.doesNotMatch(page, /\/api\/dashboard-metrics/);
});
