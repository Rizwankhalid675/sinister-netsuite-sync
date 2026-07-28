import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import {
  normalizeClient,
  normalizeClaim,
  normalizeOrder,
} from "../scripts/lib/normalizeNovaExport.js";
import {
  assertLegacyImporter,
  validateLegacyImportRequest,
} from "../api/lib/legacyImport.js";
import { projectLegacyOrder } from "../api/lib/unifiedOrders.js";
import { aggregateWindow } from "../api/lib/metrics.js";

const fileUrl = (path) => new URL(`../${path}`, import.meta.url);
const source = (path) => readFileSync(fileUrl(path), "utf8");

test("legacy order and claim schemas are source-neutral and exclude customer PII", () => {
  const orderPath = "api/models/legacyOrder/schema.gadget.ts";
  const claimPath = "api/models/legacyClaim/schema.gadget.ts";
  assert.equal(existsSync(fileUrl(orderPath)), true, `${orderPath} must exist`);
  assert.equal(existsSync(fileUrl(claimPath)), true, `${claimPath} must exist`);

  const order = source(orderPath);
  const claim = source(claimPath);
  for (const field of [
    "sourceKey", "legacyId", "platform", "orderNumber", "valueMinor",
    "currency", "protectionCostMinor", "taxMinor", "shippingMinor",
    "status", "isShipped", "trackingNumber", "placedAt", "client",
  ]) {
    assert.match(order, new RegExp(`${field}:\\s*\\{`), `missing legacyOrder.${field}`);
  }
  for (const field of [
    "sourceKey", "legacyId", "platform", "claimValueMinor", "currency",
    "status", "submittedAt", "client", "legacyOrder",
  ]) {
    assert.match(claim, new RegExp(`${field}:\\s*\\{`), `missing legacyClaim.${field}`);
  }
  assert.match(order, /sourceKey:[\s\S]*validations:\s*\{[^}]*unique:\s*true/);
  assert.match(claim, /sourceKey:[\s\S]*validations:\s*\{[^}]*unique:\s*true/);
  for (const pii of ["customerEmail", "phone", "address", "apiSecret", "password"]) {
    assert.doesNotMatch(order, new RegExp(`${pii}:\\s*\\{`));
    assert.doesNotMatch(claim, new RegExp(`${pii}:\\s*\\{`));
  }
});

test("client schema can identify a shop-less legacy source without requiring a Shopify install", () => {
  const client = source("api/models/client/schema.gadget.ts");
  assert.match(client, /legacySourceKey:\s*\{/);
  assert.match(client, /platform:\s*\{/);
  assert.match(client, /legacySourceKey:[\s\S]*validations:\s*\{\s*unique:\s*true/);
  assert.doesNotMatch(client, /shop:[\s\S]{0,160}validations:\s*\{\s*required:\s*true/);
});

const field = (attribute, value, extra = {}) => ({ attribute, value, ...extra });

test("Nova normalizers preserve operational data and remove customer PII", () => {
  const client = normalizeClient({
    id: 2,
    fields: [
      field("client_name", "SinisterDiesel"),
      field("store_id", "legacy-store"),
      field("platform", "Miva"),
      field("api_enabled", true),
      field("customer_since", "2026-03-19"),
      field("main_email", "private@example.com"),
      field("main_phone", "555-0100"),
      field("api_secret", "never-copy"),
    ],
  });
  assert.deepEqual(client, {
    sourceKey: "nova:client:2",
    legacyId: "2",
    storeName: "SinisterDiesel",
    storeId: "legacy-store",
    platform: "Miva",
    apiEnabled: true,
    customerSince: "2026-03-19",
    status: "active",
  });

  const order = normalizeOrder({
    id: 9243,
    fields: [
      field("client", "SinisterDiesel", { belongsToId: 2 }),
      field("customer", "Private Customer", { belongsToId: 99 }),
      field("order_id", "RPP30033"),
      field("value", 468.66),
      field("on_shield_cost", "5.00"),
      field("tax", "30.66"),
      field("shipping_cost", "0.00"),
      field("status", "PLACED"),
      field("tracking_number", "1Z-TEST-9243"),
      field("created_at", "2026-07-27T21:17:00.000Z"),
      field("address", { email: "private@example.com", phone: "555-0100" }),
      field("details", [{ title: "private line item" }]),
    ],
  }, new Map([["2", "Miva"]]));
  assert.deepEqual(order, {
    sourceKey: "nova:order:9243",
    legacyId: "9243",
    legacyClientId: "2",
    platform: "Miva",
    orderNumber: "RPP30033",
    valueMinor: 46866,
    protectionCostMinor: 500,
    taxMinor: 3066,
    shippingMinor: 0,
    currency: "USD",
    status: "placed",
    isShipped: false,
    trackingNumber: "1Z-TEST-9243",
    placedAt: "2026-07-27T21:17:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(order), /private|email|phone|address|details/i);

  const claim = normalizeClaim({
    id: 7,
    fields: [
      field("client", "SinisterDiesel", { belongsToId: 2 }),
      field("order", "RPP30033", { belongsToId: 9243 }),
      field("customer", "Private Customer", { belongsToId: 99 }),
      field("value", 12.34),
      field("status", "CLOSED"),
      field("created_at", "2026-07-28T00:00:00.000Z"),
    ],
  }, new Map([["2", "Miva"]]));
  assert.deepEqual(claim, {
    sourceKey: "nova:claim:7",
    legacyId: "7",
    legacyClientId: "2",
    legacyOrderId: "9243",
    platform: "Miva",
    claimValueMinor: 1234,
    currency: "USD",
    status: "closed",
    submittedAt: "2026-07-28T00:00:00.000Z",
  });
  assert.doesNotMatch(JSON.stringify(claim), /private|customer/i);
});

test("Nova normalizers reject malformed identifiers and unsafe money", () => {
  assert.throws(() => normalizeClient({ id: null, fields: [] }), /legacy ID/);
  assert.throws(
    () => normalizeOrder({ id: 1, fields: [field("client", "x"), field("value", "NaN")] }),
    /client relationship/
  );
  assert.throws(
    () => normalizeClaim({ id: 1, fields: [field("client", "x", { belongsToId: 2 }), field("value", -1)] }),
    /nonnegative money/
  );
});

test("legacy ingestion is development-only, bounded, and role restricted", () => {
  assert.throws(
    () => validateLegacyImportRequest({ resource: "clients", records: [] }, "production"),
    /disabled in production/
  );
  assert.throws(
    () => validateLegacyImportRequest({ resource: "customers", records: [] }, "development"),
    /Unsupported legacy resource/
  );
  assert.throws(
    () => validateLegacyImportRequest({ resource: "orders", records: Array(101).fill({}) }, "development"),
    /at most 100/
  );
  assert.deepEqual(
    validateLegacyImportRequest({ resource: "orders", records: [{ sourceKey: "nova:order:1" }] }, "development"),
    { resource: "orders", records: [{ sourceKey: "nova:order:1" }] }
  );
  assert.doesNotThrow(() => assertLegacyImporter({ assignments: [{ status: "active", role: { name: "Administrator" } }] }));
  assert.throws(
    () => assertLegacyImporter({ assignments: [{ status: "active", role: { name: "Claims Manager" } }] }),
    /Forbidden/
  );
});

test("legacy import route requires internal identity and never logs payloads", () => {
  const route = source("api/routes/api/POST-import-legacy-production.js");
  assert.match(route, /resolveInternalOperator/);
  assert.match(route, /assertLegacyImporter/);
  assert.match(route, /validateLegacyImportRequest/);
  assert.match(route, /upsertLegacyBatch/);
  assert.doesNotMatch(route, /logger\.(info|error|warn)\([^)]*(records|request\.body)/s);
});

test("legacy order and claim ingestion batches lookups and first-time writes", () => {
  const importer = source("api/lib/legacyImport.js");
  assert.match(importer, /findByKeys/);
  assert.match(importer, /legacyOrder\.bulkCreate\(creates\)/);
  assert.match(importer, /legacyClaim\.bulkCreate\(creates\)/);
});

test("local Nova reader is GET-only, bounded, dry-run by default, and never persists secrets", () => {
  const importer = source("scripts/import-nova-production-to-development.js");
  assert.match(importer, /connectOverCDP/);
  assert.match(importer, /method:\s*"GET"/);
  assert.match(importer, /MAX_PAGES\s*=\s*1000/);
  assert.match(importer, /PAGE_CONCURRENCY\s*=\s*3/);
  assert.match(importer, /FETCH_TIMEOUT_MS\s*=\s*20_000/);
  assert.match(importer, /--apply/);
  assert.match(importer, /click\(\{ force: true \}\)/);
  assert.match(importer, /dryRun:\s*!apply/);
  assert.match(importer, /main\(\)\s*\.then\(\(\)\s*=>\s*process\.exit\(0\)\)/);
  assert.match(importer, /POST-import-legacy-production|\/api\/import-legacy-production/);
  assert.doesNotMatch(importer, /storageState\s*\(|writeFile|appendFile|api_secret|main_email|main_phone/);
  assert.doesNotMatch(importer, /manage\.enshield\.com\/(nova-api\/)?(create|update|delete)/);
});

test("legacy orders project into the existing metrics contract", () => {
  const projected = projectLegacyOrder({
    id: "g1",
    sourceKey: "nova:order:9243",
    orderNumber: "RPP30033",
    platform: "Miva",
    valueMinor: 46866,
    protectionCostMinor: 500,
    currency: "USD",
    status: "placed",
    placedAt: "2026-07-27T21:17:00.000Z",
    client: { id: "c2", storeName: "SinisterDiesel" },
  });
  assert.equal(projected.name, "RPP30033");
  assert.equal(projected.source, "miva");
  assert.equal(projected.shopifyCreatedAt, "2026-07-27T21:17:00.000Z");
  assert.equal(projected.fulfillmentStatus, "unfulfilled");
  assert.deepEqual(projected.currentTotalPriceSet, {
    shopMoney: { amount: "468.66", currencyCode: "USD" },
  });
  const aggregate = aggregateWindow([projected], null, { now: new Date("2026-07-28") });
  assert.equal(aggregate.orders, 1);
  assert.equal(aggregate.protectedOrders, 1);
  assert.equal(aggregate.inTransitOrders, 1);
  assert.equal(aggregate.valueInTransit, 468.66);
  assert.equal(aggregate.insuranceRevenue, 5);
});

test("legacy shipment and tracking state survive normalization and projection", () => {
  const normalized = normalizeOrder({
    id: 9244,
    fields: [
      field("client", "SinisterDiesel", { belongsToId: 2 }),
      field("order_id", "RPP30034"),
      field("value", 100),
      field("status", "SHIPPED"),
      field("tracking_number", "TRACK-9244"),
    ],
  });
  assert.equal(normalized.isShipped, true);
  assert.equal(normalized.trackingNumber, "TRACK-9244");

  const projected = projectLegacyOrder({
    id: "g2",
    status: "shipped",
    isShipped: true,
    trackingNumber: "TRACK-9244",
  });
  assert.equal(projected.fulfillmentStatus, "fulfilled");
  assert.equal(projected.trackingNumber, "TRACK-9244");
  assert.equal(projectLegacyOrder({ id: "g3", status: "placed", isShipped: false }).fulfillmentStatus, "unfulfilled");
});

test("unified read routes load legacy orders only through privileged legacy visibility", () => {
  const dashboardRoute = source("api/routes/api/GET-dashboard-metrics.js");
  const ordersRoute = source("api/routes/api/GET-orders.js");
  for (const route of [dashboardRoute, ordersRoute]) {
    assert.match(route, /access\.includesLegacy/);
    assert.match(route, /api\.legacyOrder\.findMany/);
    assert.match(route, /projectLegacyOrder/);
  }
  assert.match(dashboardRoute, /miva:\s*\{\s*status:\s*mivaOrderCount\s*>\s*0\s*\?\s*"live"/);
  assert.doesNotMatch(dashboardRoute, /reason:\s*"read_api_not_configured"/);
});
