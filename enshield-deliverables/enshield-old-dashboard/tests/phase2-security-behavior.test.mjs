import assert from "node:assert/strict";
import test from "node:test";

import {
  PERMISSIONS,
  authorizeActionShop,
  requireIdentity,
  requirePermission,
} from "../api/lib/permissions.js";
import dashboardRoute from "../api/routes/api/GET-dashboard-metrics.js";
import claimsRoute from "../api/routes/api/GET-claims.js";
import clientsRoute from "../api/routes/api/GET-clients.js";
import getMetafieldsRoute from "../api/routes/api/GET-get-metafields.js";
import meRoute from "../api/routes/api/GET-me.js";
import shopInfoRoute from "../api/routes/api/GET-shop-info.js";
import usersRoute from "../api/routes/api/GET-users.js";
import updateMetafieldRoute from "../api/routes/api/POST-update-metafield.js";
import { run as createInsuranceVariants } from "../api/actions/createInsuranceVariants.js";
import { run as sendOrderToEnshield } from "../api/actions/sendOrderToEnshield.js";
import { run as sendTrackingToEnshield } from "../api/actions/sendTrackingToEnshield.js";
import { run as setupInsuranceProduct } from "../api/actions/setupInsuranceProduct.js";
import { run as setupShippingInsuranceProduct } from "../api/actions/setupShippingInsuranceProduct.js";

const SHOP_ID = "shop-1";
const FOREIGN_SHOP_ID = "shop-2";

const logger = {
  info() {},
  warn() {},
  error() {},
};

function sessionFor({
  shopId = SHOP_ID,
  roles = ["shopify-app-users"],
} = {}) {
  return {
    get(key) {
      return { shopId, roles, shopifySID: "sid-1" }[key];
    },
  };
}

function replyRecorder() {
  return {
    statusCode: 200,
    payload: null,
    code(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    async send(payload) {
      this.payload = payload;
      return this;
    },
  };
}

function assertShopFilter(options) {
  assert.deepEqual(options.filter, { id: { equals: SHOP_ID } });
}

function bootstrapApi({ shop = { id: SHOP_ID }, onShopQuery } = {}) {
  return {
    shopifyShop: {
      async findFirst(options) {
        assertShopFilter(options);
        onShopQuery?.(options);
        return shop;
      },
    },
  };
}

test("real Shopify sessions resolve to a least-privilege shop principal without an internal role", async () => {
  const identity = await requireIdentity({
    api: bootstrapApi(),
    session: sessionFor(),
  });

  assert.equal(identity.shopId, SHOP_ID);
  assert.deepEqual(identity.user, {
    id: `shop:${SHOP_ID}`,
    name: "Shop merchant",
    email: null,
    principalType: "shop",
    role: null,
  });
  assert.equal(identity.roleKey, "Shop Merchant");
  assert.deepEqual(
    await requirePermission(
      { api: bootstrapApi(), session: sessionFor() },
      PERMISSIONS.MANAGE_STOREFRONT_CONFIGURATION
    ),
    identity.user,
    "the shop principal may perform the minimum storefront configuration work"
  );

  const storefrontPermissions = new Set([
    PERMISSIONS.VIEW_STOREFRONT_CONFIGURATION,
    PERMISSIONS.MANAGE_STOREFRONT_CONFIGURATION,
  ]);
  for (const permission of Object.values(PERMISSIONS)) {
    if (storefrontPermissions.has(permission)) continue;
    await assert.rejects(
      requirePermission(
        { api: bootstrapApi(), session: sessionFor() },
        permission
      ),
      (error) => error.statusCode === 403,
      `shop principal must not receive internal permission ${permission}`
    );
  }
});

test("shop identity rejects missing, malformed, stale, unknown, and injected session roles", async () => {
  const cases = [
    {
      session: sessionFor({ roles: ["unauthenticated"] }),
      api: bootstrapApi(),
      statusCode: 401,
    },
    {
      session: sessionFor({ roles: "shopify-app-users" }),
      api: bootstrapApi(),
      statusCode: 401,
    },
    {
      session: sessionFor({ roles: [] }),
      api: bootstrapApi(),
      statusCode: 401,
    },
    {
      session: sessionFor({ roles: ["shopify-app-users-v1"] }),
      api: bootstrapApi(),
      statusCode: 401,
    },
    {
      session: sessionFor({
        roles: ["shopify-app-users", "Administrator"],
      }),
      api: bootstrapApi(),
      statusCode: 401,
    },
    {
      session: sessionFor({ shopId: null }),
      api: bootstrapApi(),
      statusCode: 401,
    },
    {
      session: sessionFor(),
      api: bootstrapApi({ shop: null }),
      statusCode: 403,
    },
  ];

  for (const entry of cases) {
    await assert.rejects(
      requireIdentity(entry),
      (error) => error.statusCode === entry.statusCode
    );
  }
});

test("shop sessions never bypass missing person identity by adopting an appUser assignment", async () => {
  let appUserQueries = 0;
  const api = bootstrapApi();
  api.appUser = {
    async findFirst() {
      appUserQueries += 1;
      return {
        id: "assigned-user",
        active: true,
        role: { name: "Super Admin" },
      };
    },
  };

  await assert.rejects(
    requirePermission(
      { api, session: sessionFor() },
      PERMISSIONS.MANAGE_USERS
    ),
    (error) =>
      error.statusCode === 403 &&
      /person identity required/i.test(error.message)
  );
  assert.equal(
    appUserQueries,
    0,
    "an uncorrelatable appUser assignment must never be selected or bypassed"
  );
});

test("internal dashboard data fails closed before any superuser read for a shop-only session", async () => {
  const orderPage = Object.assign([], { hasNextPage: false });
  const dashboardReply = replyRecorder();
  const dashboardApi = bootstrapApi();
  let internalReads = 0;
  dashboardApi.shippingInsuranceSetting = {
    async findFirst(options) {
      internalReads += 1;
      assert.deepEqual(options.filter, { shopId: { equals: SHOP_ID } });
      return { id: "setting-1", status: "active", insuranceRate: 2 };
    },
  };
  dashboardApi.shopifyOrder = {
    async findMany(options) {
      internalReads += 1;
      assert.deepEqual(options.filter, { shopId: { equals: SHOP_ID } });
      return orderPage;
    },
  };

  await dashboardRoute({
    request: { query: {} },
    reply: dashboardReply,
    api: dashboardApi,
    logger,
    session: sessionFor(),
  });
  assert.equal(dashboardReply.statusCode, 401);
  assert.equal(internalReads, 0);
});

test("storefront configuration reads remain tenant-filtered for a shop principal", async () => {
  for (const route of [shopInfoRoute, getMetafieldsRoute]) {
    const reply = replyRecorder();
    const api = bootstrapApi();
    const connections = {
      shopify: {
        async forShopId(shopId) {
          assert.equal(shopId, SHOP_ID);
          return {
            async graphql() {
              return { shop: { metafields: { edges: [] } } };
            },
          };
        },
      },
    };

    await route({
      request: { query: {} },
      reply,
      api,
      logger,
      connections,
      session: sessionFor(),
    });
    assert.equal(reply.statusCode, 200);
  }
});

test("client, claim, and user data fail closed before reads for a shop-only session", async () => {
  for (const [route, modelName, payloadKey] of [
    [clientsRoute, "client", "clients"],
    [claimsRoute, "claim", "claims"],
    [usersRoute, "operatorShopAssignment", "users"],
  ]) {
    const page = Object.assign([], { hasNextPage: false });
    const api = bootstrapApi();
    let internalReads = 0;
    api[modelName] = {
      async findMany(options) {
        internalReads += 1;
        assert.deepEqual(options.filter, { shopId: { equals: SHOP_ID } });
        return page;
      },
    };
    const reply = replyRecorder();
    await route({
      reply,
      api,
      logger,
      session: sessionFor(),
    });
    assert.equal(reply.statusCode, 401, modelName);
    assert.equal(internalReads, 0, modelName);
    assert.equal(reply.payload[payloadKey], undefined, modelName);
  }
});

test("internal identity rejects shop-only sessions while storefront mutation remains shop-scoped", async () => {
  const meReply = replyRecorder();
  await meRoute({
    request: { query: {} },
    reply: meReply,
    api: bootstrapApi(),
    logger,
    session: sessionFor(),
  });
  assert.equal(meReply.statusCode, 401);
  assert.deepEqual(meReply.payload.permissions, []);
  assert.equal(meReply.payload.user, null);

  const updateReply = replyRecorder();
  const api = bootstrapApi();
  const connections = {
    shopify: {
      async forShopId(shopId) {
        assert.equal(shopId, SHOP_ID);
        return {
          async graphql() {
            return { metafieldsSet: { metafields: [], userErrors: [] } };
          },
        };
      },
    },
  };
  await updateMetafieldRoute({
    request: {
      body: { learnMoreUrl: "https://example.com/protection" },
    },
    reply: updateReply,
    api,
    logger,
    connections,
    session: sessionFor(),
  });
  assert.equal(updateReply.statusCode, 200);
});

const ACTION_CASES = [
  {
    name: "createInsuranceVariants",
    run: createInsuranceVariants,
    params: { shopId: SHOP_ID },
    shopApiAllowed: true,
  },
  {
    name: "sendOrderToEnshield",
    run: sendOrderToEnshield,
    params: { orderId: "order-1", shopId: SHOP_ID },
    config: { ENSHIELD_API_KEY: "test-key" },
    shopApiAllowed: false,
  },
  {
    name: "sendTrackingToEnshield",
    run: sendTrackingToEnshield,
    params: {
      orderId: "order-1",
      shopId: SHOP_ID,
      trackingNumber: "tracking-1",
    },
    config: { ENSHIELD_API_KEY: "test-key" },
    usesFetch: true,
    shopApiAllowed: false,
  },
  {
    name: "setupInsuranceProduct",
    run: setupInsuranceProduct,
    params: { shopId: SHOP_ID },
    shopApiAllowed: true,
  },
  {
    name: "setupShippingInsuranceProduct",
    run: setupShippingInsuranceProduct,
    params: { shopId: SHOP_ID },
    shopApiAllowed: true,
  },
];

async function invokeUntilFirstEffect(entry, { trigger, session, shopId }) {
  const events = [];
  const identityApi = bootstrapApi({
    onShopQuery() {
      events.push("identity");
    },
  });
  const api = {
    ...identityApi,
  };
  if (entry.name === "createInsuranceVariants") {
    api.shippingInsuranceProduct = {
      async findFirst() {
        events.push("effect");
        throw new Error("effect reached");
      },
    };
  }
  if (
    entry.name === "sendOrderToEnshield" ||
    entry.name === "sendTrackingToEnshield"
  ) {
    api.integrationDelivery = {
      async findFirst() {
        events.push("effect");
        throw new Error("effect reached");
      },
    };
  }
  if (entry.name === "setupShippingInsuranceProduct") {
    api.shopifyShop = {
      ...identityApi.shopifyShop,
      async findOne() {
        events.push("effect");
        throw new Error("effect reached");
      },
    };
  }
  const connections = {
    shopify: {
      async forShopId() {
        events.push("effect");
        throw new Error("effect reached");
      },
    },
  };
  const originalFetch = globalThis.fetch;
  if (entry.usesFetch) {
    globalThis.fetch = async () => {
      events.push("effect");
      throw new Error("effect reached");
    };
  }

  try {
    await entry.run({
      params: { ...entry.params, shopId },
      logger,
      api,
      connections,
      config: entry.config || {},
      trigger,
      session,
    });
    assert.fail(`${entry.name} should reach or reject before its first effect`);
  } catch (error) {
    return { error, events };
  } finally {
    globalThis.fetch = originalFetch;
  }
}

test("all five actions authorize API calls, while shop sessions can invoke only storefront setup", async () => {
  for (const entry of ACTION_CASES) {
    const foreign = await invokeUntilFirstEffect(entry, {
      trigger: { type: "api" },
      session: sessionFor(),
      shopId: FOREIGN_SHOP_ID,
    });
    assert.equal(foreign.error.statusCode, 403, entry.name);
    assert.deepEqual(foreign.events, ["identity"], entry.name);

    const own = await invokeUntilFirstEffect(entry, {
      trigger: { type: "api" },
      session: sessionFor(),
      shopId: SHOP_ID,
    });
    assert.ok(own.error, entry.name);
    assert.deepEqual(
      own.events,
      entry.shopApiAllowed ? ["identity", "effect"] : ["identity"],
      entry.name
    );
    if (!entry.shopApiAllowed) {
      assert.equal(own.error.statusCode, 403, entry.name);
    }
  }
});

test("all five actions allow only a shop-bound background branch", async () => {
  await assert.rejects(
    authorizeActionShop(
      {
        api: {},
        session: undefined,
        trigger: { type: "background-action" },
        params: {},
      },
      PERMISSIONS.MANAGE_STOREFRONT_CONFIGURATION
    ),
    (error) => error.statusCode === 401
  );

  for (const entry of ACTION_CASES) {
    const background = await invokeUntilFirstEffect(entry, {
      trigger: { type: "background-action" },
      session: undefined,
      shopId: SHOP_ID,
    });
    assert.ok(background.error, entry.name);
    assert.deepEqual(background.events, ["effect"], entry.name);
  }
});

function collectingLogger() {
  const entries = [];
  return {
    entries,
    info(...args) {
      entries.push(args);
    },
    warn(...args) {
      entries.push(args);
    },
    error(...args) {
      entries.push(args);
    },
  };
}

test("Enshield delivery logs omit customer PII, tracking numbers, secrets, and raw responses", async () => {
  const originalFetch = globalThis.fetch;
  try {
    const orderLogger = collectingLogger();
    const order = {
      id: "gid://shopify/Order/123",
      name: "#123",
      email: "alice@example.test",
      phone: "+1-555-0100",
      totalPriceSet: { shopMoney: { amount: "42.00" } },
      billingAddress: { name: "Alice Example" },
      shippingAddress: {
        address1: "123 Private Street",
        city: "Secretville",
        country: "US",
        zip: "90210",
      },
      customAttributes: [{ key: "shippingInsurance", value: "true" }],
      lineItems: { edges: [] },
    };
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      headers: { get: () => "application/json" },
      async text() {
        return '{"success":true,"customer":"response@example.test"}';
      },
    });
    await sendOrderToEnshield({
      params: { orderId: "123", shopId: SHOP_ID },
      trigger: { type: "background-action" },
      session: undefined,
      logger: orderLogger,
      api: {
        integrationDelivery: { async findFirst() { return null; } },
        internal: {
          integrationDelivery: {
            async create(values) { return { id: "order-delivery", ...values }; },
          },
        },
      },
      config: { ENSHIELD_API_KEY: "super-secret-key" },
      connections: {
        shopify: {
          async forShopId() {
            return { async graphql() { return { order }; } };
          },
        },
      },
    });

    const trackingLogger = collectingLogger();
    globalThis.fetch = async () => ({
      ok: true,
      status: 200,
      statusText: "OK",
      async text() {
        return "raw response@example.test";
      },
    });
    await sendTrackingToEnshield({
      params: {
        orderId: "123",
        shopId: SHOP_ID,
        trackingNumber: "TRACK-SECRET-123",
      },
      trigger: { type: "background-action" },
      session: undefined,
      logger: trackingLogger,
      api: {
        integrationDelivery: { async findFirst() { return null; } },
        internal: {
          integrationDelivery: {
            async create(values) { return { id: "tracking-delivery", ...values }; },
          },
        },
      },
      config: { ENSHIELD_API_KEY: "super-secret-key" },
    });

    const logs = JSON.stringify([
      ...orderLogger.entries,
      ...trackingLogger.entries,
    ]);
    for (const forbidden of [
      "alice@example.test",
      "+1-555-0100",
      "Alice Example",
      "123 Private Street",
      "90210",
      "response@example.test",
      "TRACK-SECRET-123",
      "super-secret-key",
    ]) {
      assert.equal(logs.includes(forbidden), false, forbidden);
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
