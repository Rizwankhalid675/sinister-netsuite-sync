import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  ENSHIELD_PROTECTION_ATTRIBUTE,
  calculateProtectionPrice,
  getProtectionPriceSnapshot,
  hasEnshieldProtection,
  isProtectionEligible,
  loadProtectionPricing,
  selectProtectionPricing,
  selectExactVariant,
  buildChargedProtectionSnapshot,
  assertProtectionSnapshotImmutable,
} from "../api/lib/protection.js";
import { aggregateWindow } from "../api/lib/metrics.js";
import createVariantRoute from "../api/routes/api/POST-create-insurance-variant.js";
import { run as updatePricing } from "../api/models/shippingInsuranceSetting/actions/update.js";
import { run as deletePricing } from "../api/models/shippingInsuranceSetting/actions/delete.js";

test("only the canonical Enshield attribute proves protection", () => {
  assert.equal(ENSHIELD_PROTECTION_ATTRIBUTE, "shippingInsurance");
  assert.equal(hasEnshieldProtection({
    shopifyProtect: true,
    noteAttributes: [],
  }), false);
  assert.equal(hasEnshieldProtection({
    shopifyProtect: false,
    noteAttributes: [{ name: "shippingInsurance", value: "true" }],
  }), true);
});

test("conflicting or malformed canonical attributes fail closed", () => {
  assert.equal(hasEnshieldProtection({
    noteAttributes: [
      { name: "shippingInsurance", value: "true" },
      { name: "shippingInsurance", value: "false" },
    ],
  }), false);
  assert.equal(hasEnshieldProtection({
    customAttributes: [{ key: "shippingInsurance", value: true }],
  }), true);
  assert.equal(hasEnshieldProtection({
    noteAttributes: [{ name: "shipping_insurance", value: "true" }],
  }), false);
  assert.equal(hasEnshieldProtection({}), false);
  assert.equal(hasEnshieldProtection({
    noteAttributes: JSON.stringify([{ name: "shippingInsurance", value: "true" }]),
  }), true);
  assert.equal(hasEnshieldProtection({
    noteAttributes: "not-json",
  }), false);
  assert.equal(hasEnshieldProtection({
    noteAttributes: JSON.stringify([{ name: "shippingInsurance", value: "true" }]),
    customAttributes: [{ key: "shippingInsurance", value: "false" }],
    attributes: { shippingInsurance: true },
  }), false);
});

test("versioned pricing config is complete, effective, and fail closed", () => {
  const row = {
    basePercentage: "2.5",
    baseAmount: "0.97",
    currency: "usd",
    pricingVersion: "v3",
    effectiveAt: "2026-01-01T00:00:00.000Z",
  };
  assert.deepEqual(loadProtectionPricing(row, new Date("2026-02-01")), {
    percentage: "2.5",
    baseAmount: "0.97",
    currency: "USD",
    version: "v3",
    effectiveAt: "2026-01-01T00:00:00.000Z",
  });
  assert.throws(() => loadProtectionPricing({ ...row, basePercentage: "2x" }), /pricing/i);
  assert.throws(() => loadProtectionPricing({ ...row, effectiveAt: "2027-01-01" }, new Date("2026-02-01")), /effective/i);
});

test("pricing selection ignores inactive/future rows and rejects ambiguous effective rows", () => {
  const row = (version, effectiveAt, status = "active") => ({
    basePercentage: "2", baseAmount: "0.97", currency: "USD",
    pricingVersion: version, effectiveAt, status,
  });
  assert.equal(selectProtectionPricing([
    row("v1", "2026-01-01"), row("v2", "2026-02-01"),
    row("v3", "2027-01-01"), row("off", "2026-03-01", "inactive"),
  ], new Date("2026-04-01")).version, "v2");
  assert.throws(() => selectProtectionPricing([
    row("a", "2026-01-01"), row("b", "2026-01-01"),
  ], new Date("2026-04-01")), /ambiguous/i);
});

test("pricing rows are append-only and version-unique per shop", async () => {
  await assert.rejects(updatePricing({}), (error) => error.statusCode === 405);
  await assert.rejects(deletePricing({}), (error) => error.statusCode === 405);
  const schema = readFileSync(
    new URL("../api/models/shippingInsuranceSetting/schema.gadget.ts", import.meta.url),
    "utf8"
  );
  assert.match(schema, /shopVersionKey[\s\S]*unique:\s*true/);
});

test("charged snapshot requires the trusted exact Enshield variant and is write-once", () => {
  const pricing = { version: "v1", currency: "USD" };
  assert.equal(buildChargedProtectionSnapshot({
    lineItems: [], trustedVariantId: null, pricing,
  }), null);
  const snapshot = buildChargedProtectionSnapshot({
    trustedVariantId: "variant-1",
    pricing,
    lineItems: [{ variantId: "variant-1", chargedAmount: "1.97", currency: "USD" }],
  });
  assert.deepEqual(snapshot, {
    enshieldProtectionAmountMinor: 197,
    enshieldProtectionCurrency: "USD",
    enshieldPricingVersion: "v1",
  });
  assert.doesNotThrow(() => assertProtectionSnapshotImmutable({}, snapshot));
  assert.throws(() => assertProtectionSnapshotImmutable(snapshot, {
    ...snapshot, enshieldProtectionAmountMinor: 198,
  }), /immutable/i);
});

test("historical revenue accepts only a complete immutable charged-price snapshot", () => {
  assert.deepEqual(getProtectionPriceSnapshot({
    enshieldProtectionAmountMinor: 197,
    enshieldProtectionCurrency: "USD",
    enshieldPricingVersion: "v2",
  }), { amountMinor: 197, currency: "USD", version: "v2" });
  assert.equal(getProtectionPriceSnapshot({
    enshieldProtectionAmountMinor: 197,
    enshieldProtectionCurrency: "CAD",
    currency: "USD",
  }), null);
  assert.equal(getProtectionPriceSnapshot({ enshieldProtectionAmountMinor: "1.97" }), null);
});

test("variant selection requires an exact minor-unit price and matching currency", () => {
  const variants = [
    { node: { id: "malformed", price: "not-money", currencyCode: "USD" } },
    { node: { id: "near", price: "1.96", currencyCode: "USD" } },
    { node: { id: "wrong-currency", price: "1.97", currencyCode: "CAD" } },
    { node: { id: "exact", price: "1.97", currencyCode: "USD" } },
  ];
  assert.equal(selectExactVariant(variants, 197, "USD")?.node.id, "exact");
  assert.equal(selectExactVariant(variants.slice(0, 3), 197, "USD"), null);
});

test("create-variant route rejects requests without a verified Shopify tenant context", async () => {
  const reply = {
    statusCode: 200,
    body: null,
    code(value) { this.statusCode = value; return this; },
    send(value) { this.body = value; return this; },
  };
  let reads = 0;

  await createVariantRoute({
    request: { body: { cartTotal: 50, shopDomain: "a.myshopify.com", currency: "USD" } },
    reply,
    logger: { info() {}, warn() {}, error() {} },
    api: { shopifyShop: { findFirst: async () => { reads += 1; } } },
    connections: { shopify: {} },
  });

  assert.equal(reply.statusCode, 401);
  assert.equal(reply.body.error, "Authenticated Shopify context required");
  assert.equal(reads, 0);
});

test("create-variant route rejects a verified tenant/domain mismatch before any read", async () => {
  const reply = {
    statusCode: 200,
    body: null,
    code(value) { this.statusCode = value; return this; },
    send(value) { this.body = value; return this; },
  };
  let databaseReads = 0;
  let shopifyReads = 0;

  await createVariantRoute({
    request: { body: { cartTotal: 50, shopDomain: "foreign.myshopify.com", currency: "USD" } },
    reply,
    logger: { info() {}, warn() {}, error() {} },
    api: {
      shopifyShop: { findFirst: async () => { databaseReads += 1; } },
    },
    connections: {
      shopify: {
        currentAppProxy: { pathPrefix: "apps/enshield" },
        currentShopId: "shop-1",
        currentShopDomain: "assigned.myshopify.com",
        forShopId: async () => {
          shopifyReads += 1;
          return {};
        },
      },
    },
  });

  assert.equal(reply.statusCode, 403);
  assert.equal(reply.body.error, "Shopify tenant mismatch");
  assert.equal(databaseReads, 0);
  assert.equal(shopifyReads, 0);
});

test("create-variant route refuses a near-priced variant instead of undercharging", async () => {
  const reply = {
    statusCode: 200,
    body: null,
    code(value) { this.statusCode = value; return this; },
    send(value) { this.body = value; return this; },
  };
  await createVariantRoute({
    request: { body: { cartTotal: 50, shopDomain: "a.myshopify.com", currency: "USD" } },
    reply,
    logger: { info() {}, warn() {}, error() {} },
    api: {
      shopifyShop: { findFirst: async () => ({ id: "shop-1", currency: "USD" }) },
      shippingInsuranceSetting: { findMany: async () => [{
        basePercentage: "2",
        baseAmount: "0.97",
        currency: "USD",
        pricingVersion: "v1",
        effectiveAt: "2020-01-01T00:00:00.000Z", status: "active",
      }] },
      shippingInsuranceProduct: { findFirst: async () => ({
        productId: "1", productGid: "gid://shopify/Product/1", variantId: "1",
      }) },
    },
    connections: { shopify: { currentAppProxy: { pathPrefix: "apps/enshield" }, currentShopId: "shop-1", currentShopDomain: "a.myshopify.com", forShopId: async () => ({
      graphql: async () => ({
        product: { variants: {
          edges: [{ node: { id: "near", legacyResourceId: "9", price: "1.96" } }],
          pageInfo: { hasNextPage: false, endCursor: null },
        } },
      }),
    }) } },
  });
  assert.equal(reply.statusCode, 409);
  assert.equal(reply.body.amountMinor, 197);
});

test("create-variant route returns the exact priced variant", async () => {
  const reply = { statusCode: 200, body: null, code(v) { this.statusCode = v; return this; },
    send(v) { this.body = v; return this; } };
  await createVariantRoute({
    request: { body: { cartTotal: 50, shopDomain: "a.myshopify.com", currency: "USD" } },
    reply, logger: { info() {}, warn() {}, error() {} },
    api: {
      shopifyShop: { findFirst: async () => ({ id: "s", currency: "USD" }) },
      shippingInsuranceSetting: { findMany: async () => [{
        basePercentage: "2", baseAmount: "0.97", currency: "USD",
        pricingVersion: "v1", effectiveAt: "2020-01-01", status: "active",
      }] },
      shippingInsuranceProduct: { findFirst: async () => ({
        productId: "1", productGid: "gid://shopify/Product/1", variantId: "1",
      }) },
    },
    connections: { shopify: { currentAppProxy: { pathPrefix: "apps/enshield" }, currentShopId: "s", currentShopDomain: "a.myshopify.com", forShopId: async () => ({ graphql: async () => ({
      product: { variants: { edges: [{
        node: { id: "exact", legacyResourceId: "197", price: "1.97" },
      }], pageInfo: { hasNextPage: false } } },
    }) }) } },
  });
  assert.equal(reply.statusCode, 200);
  assert.equal(reply.body.variantId, "197");
});

test("price combines percentage and base amount using half-up minor-unit rounding", () => {
  assert.deepEqual(
    calculateProtectionPrice({
      orderAmountMinor: 12_345,
      percentage: "2",
      baseAmount: "0.97",
      currency: "USD",
    }),
    { amountMinor: 344, currency: "USD", minorUnit: 2 }
  );
  assert.deepEqual(
    calculateProtectionPrice({
      orderAmountMinor: 1,
      percentage: "50",
      baseAmount: "0",
      currency: "USD",
    }),
    { amountMinor: 1, currency: "USD", minorUnit: 2 }
  );
});

test("price respects currencies with zero and three decimal minor units", () => {
  assert.equal(calculateProtectionPrice({
    orderAmountMinor: 101,
    percentage: "2.5",
    baseAmount: "1",
    currency: "JPY",
  }).amountMinor, 4);
  assert.equal(calculateProtectionPrice({
    orderAmountMinor: 1000,
    percentage: "1",
    baseAmount: "0",
    currency: "VND",
  }).minorUnit, 0);
  assert.equal(calculateProtectionPrice({
    orderAmountMinor: 1000,
    percentage: "2.5",
    baseAmount: "0.125",
    currency: "KWD",
  }).amountMinor, 150);
});

test("invalid, negative, or unsafe monetary input is rejected", () => {
  for (const input of [
    { orderAmountMinor: -1, percentage: "2", baseAmount: "0", currency: "USD" },
    { orderAmountMinor: 100, percentage: "-1", baseAmount: "0", currency: "USD" },
    { orderAmountMinor: 100, percentage: "wat", baseAmount: "0", currency: "USD" },
    { orderAmountMinor: Number.MAX_SAFE_INTEGER + 1, percentage: "2", baseAmount: "0", currency: "USD" },
  ]) {
    assert.throws(() => calculateProtectionPrice(input), /invalid|safe|negative/i);
  }
});

test("cancelled and fully-refunded orders are not protection eligible", () => {
  const protectedOrder = {
    noteAttributes: [{ name: "shippingInsurance", value: "true" }],
  };
  assert.equal(isProtectionEligible(protectedOrder), true);
  assert.equal(isProtectionEligible({ ...protectedOrder, cancelledAt: "2026-01-02" }), false);
  assert.equal(isProtectionEligible({
    ...protectedOrder,
    financialStatus: "refunded",
  }), false);
  assert.equal(isProtectionEligible({
    ...protectedOrder,
    financialStatus: "partially_refunded",
  }), true);
  assert.equal(isProtectionEligible({
    ...protectedOrder,
    financialStatus: "paid",
    currentTotalPriceSet: { shopMoney: { amount: "10.00" } },
    totalRefundedSet: { shopMoney: { amount: "10.00" } },
  }), false);
  assert.equal(isProtectionEligible({
    ...protectedOrder,
    currentTotalPriceSet: { shopMoney: { amount: "10.00", currencyCode: "USD" } },
    totalRefundedSet: { shopMoney: { amount: "1.00", currencyCode: "CAD" } },
  }), false);
  assert.equal(isProtectionEligible({
    ...protectedOrder,
    currentTotalPriceSet: { shopMoney: { amount: "10.00", currencyCode: "USD" } },
    totalRefundedSet: { shopMoney: { amount: "NaN", currencyCode: "USD" } },
  }), false);
});

test("metrics price eligible orders from net order value and keep partial refunds", () => {
  const marker = [{ name: "shippingInsurance", value: "true" }];
  const money = (amount) => ({ shopMoney: { amount, currencyCode: "USD" } });
  const result = aggregateWindow([
    {
      noteAttributes: marker,
      currentTotalPriceSet: money("75.00"),
      totalRefundedSet: money("25.00"),
      financialStatus: "partially_refunded",
      enshieldProtectionAmountMinor: 247,
      enshieldProtectionCurrency: "USD",
      enshieldPricingVersion: "v1",
      currency: "USD",
    },
    {
      noteAttributes: marker,
      currentTotalPriceSet: money("100.00"),
      totalRefundedSet: money("100.00"),
      financialStatus: "refunded",
    },
    {
      noteAttributes: marker,
      currentTotalPriceSet: money("100.00"),
      cancelledAt: "2026-01-02",
      financialStatus: "paid",
    },
  ], null);
  assert.equal(result.protectedOrders, 3);
  assert.equal(result.activeProtectedOrders, 1);
  assert.equal(result.insuranceRevenue, 2.47);
});

test("all protection consumers use the canonical protection library", () => {
  const files = [
    "api/lib/enshieldDelivery.js",
    "api/models/shopifyOrder/actions/create.js",
    "api/models/shopifyOrder/actions/update.js",
    "api/models/shopifyOrder/actions/delete.js",
    "api/routes/webhooks/cart/POST-update.js",
    "api/routes/api/POST-create-insurance-variant.js",
  ];
  for (const file of files) {
    const text = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(text, /(?:lib\/|\.\/)protection\.js/);
    assert.doesNotMatch(text, /Math\.round\s*\(\s*insuranceCost/);
    assert.doesNotMatch(text, /expectedInsuranceCost\s*=\s*cartTotal\s*\*/);
    assert.doesNotMatch(text, /attr\.(?:name|key)\s*===\s*['"]shippingInsurance['"]/);
  }
});
