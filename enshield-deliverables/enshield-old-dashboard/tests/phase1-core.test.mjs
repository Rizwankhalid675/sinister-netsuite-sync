import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  CLAIM_STATUSES,
  assertLegalTransition,
  isLegalTransition,
} from "../api/lib/claimStateMachine.js";
import { aggregateWindow, normalizeRange } from "../api/lib/metrics.js";
import { currencyOf, delta, money, pct } from "../api/lib/money.js";
import {
  PERMISSIONS,
  ROLE_NAMES,
  grantsForRole,
} from "../api/lib/permissions.js";

const source = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

test("all nine roles resolve to explicit permission arrays", () => {
  assert.equal(ROLE_NAMES.length, 9);
  for (const role of ROLE_NAMES) {
    assert.ok(Array.isArray(grantsForRole(role)));
    assert.ok(grantsForRole(role).length > 0);
  }
  assert.deepEqual(grantsForRole("not-a-role"), []);
});

test("only privileged roles receive user-management permission", () => {
  const managers = ROLE_NAMES.filter((role) =>
    grantsForRole(role).includes(PERMISSIONS.MANAGE_USERS)
  );
  assert.deepEqual(managers, ["Super Admin", "Administrator"]);
});

test("claim state machine accepts documented transitions and rejects illegal ones", () => {
  assert.equal(CLAIM_STATUSES.length, 15);
  assert.equal(isLegalTransition("Draft", "Submitted"), true);
  assert.equal(isLegalTransition("Paid", "Closed"), true);
  assert.equal(isLegalTransition("Draft", "Paid"), false);
  assert.throws(
    () => assertLegalTransition("Draft", "Paid"),
    /Illegal claim status transition/
  );
});

test("money helpers prefer shop currency and handle invalid values safely", () => {
  const bag = {
    shopMoney: { amount: "12.34", currencyCode: "USD" },
    presentmentMoney: { amount: "99.00", currencyCode: "CAD" },
  };
  assert.equal(money(bag), 12.34);
  assert.equal(currencyOf(bag), "USD");
  assert.equal(money({ shopMoney: { amount: "not-money" } }), 0);
  assert.equal(pct(1, 4), 25);
  assert.equal(pct(1, 0), 0);
  assert.equal(delta(150, 100), 50);
  assert.equal(delta(150, 0), null);
});

test("metrics aggregate a bounded order window without NaN values", () => {
  const orders = [
    {
      shopifyCreatedAt: "2026-01-15T00:00:00.000Z",
      currentTotalPriceSet: { shopMoney: { amount: "100", currencyCode: "USD" } },
      totalShippingPriceSet: { shopMoney: { amount: "10" } },
      totalRefundedSet: { shopMoney: { amount: "0", currencyCode: "USD" } },
      shopifyProtect: false,
      noteAttributes: [{ name: "shippingInsurance", value: "true" }],
      enshieldProtectionAmountMinor: 200,
      enshieldProtectionCurrency: "USD",
      enshieldPricingVersion: "v1",
      currency: "USD",
      fulfillmentStatus: "fulfilled",
      financialStatus: "paid",
    },
    {
      shopifyCreatedAt: "2025-01-15T00:00:00.000Z",
      currentTotalPriceSet: { shopMoney: { amount: "50" } },
      shopifyProtect: false,
      fulfillmentStatus: null,
      financialStatus: "paid",
    },
  ];
  const result = aggregateWindow(orders, new Date("2026-01-01T00:00:00.000Z"), {
    now: new Date("2026-12-31T23:59:59.999Z"),
    rate: 2,
  });
  assert.equal(result.orders, 1);
  assert.equal(result.revenue, 100);
  assert.equal(result.protectedOrders, 1);
  assert.equal(result.activeProtectedOrders, 1);
  assert.equal(result.insuranceRevenue, 2);
  assert.equal(normalizeRange("nonsense"), "30d");
});

test("tenancy-scoped read routes select only display fields and expose bounded cursors", () => {
  for (const name of ["clients", "claims", "users"]) {
    const route = source(`api/routes/api/GET-${name}.js`);
    assert.match(route, /findMany\s*\(\s*\{/);
    assert.match(route, /select:\s*\{/);
    assert.match(route, /pageInfoFor/);
    assert.match(route, /parsePageSize/);
    assert.match(route, /after:\s*query\.after/);
    assert.doesNotMatch(route, /api\.internal/);
  }
});

test("application router exposes clients, claims, and users pages", () => {
  const app = source("web/components/App.jsx");
  assert.match(app, /import\s+\{\s*ClientsPage\s*\}/);
  assert.match(app, /import\s+\{\s*ClaimsPage\s*\}/);
  assert.match(app, /import\s+\{\s*UsersPage\s*\}/);
  assert.match(app, /path="clients"\s+element=\{<ClientsPage\s*\/>\}/);
  assert.match(app, /path="claims"\s+element=\{<ClaimsPage\s*\/>\}/);
  assert.match(app, /path="users"\s+element=\{<UsersPage\s*\/>\}/);
});

test("users page is permission-gated and reads the session-scoped endpoint", () => {
  const users = source("web/routes/users.jsx");
  assert.match(users, /PERMISSIONS\.VIEW_USERS/);
  assert.match(users, /usePagedResource\("\/api\/users"/);
  assert.match(source("web/lib/usePagedResource.jsx"), /credentials:\s*"include"/);
  assert.match(users, /Users and roles/);
});
