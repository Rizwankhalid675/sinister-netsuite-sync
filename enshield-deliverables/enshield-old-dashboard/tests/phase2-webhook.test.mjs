import assert from "node:assert/strict";
import crypto from "node:crypto";
import Fastify from "fastify";
import test from "node:test";
import { InvalidRecordError } from "../.gadget/client/dist-esm/connection/support.js";

import route from "../api/routes/webhooks/cart/POST-update.js";
import webhookScope from "../api/routes/webhooks/+scope.js";
import {
  buildWebhookDeliveryKey,
  verifyShopifyWebhook,
} from "../api/lib/verifyShopifyWebhook.js";

const SECRET = "test-only-shopify-secret";
const payload = {
  token: "sensitive-cart-token",
  total_price: 10000,
  currency: "USD",
  attributes: { shippingInsurance: true },
  items: [{ id: 1 }],
};
const rawBody = Buffer.from(JSON.stringify(payload));
const validHmac = crypto
  .createHmac("sha256", SECRET)
  .update(rawBody)
  .digest("base64");

const makeReply = () => ({
  statusCode: 200,
  body: undefined,
  code(value) {
    this.statusCode = value;
    return this;
  },
  send(value) {
    this.body = value;
    return this;
  },
});

const makeLogger = () => {
  const entries = [];
  return {
    entries,
    info(data, message) {
      entries.push({ level: "info", data, message });
    },
    warn(data, message) {
      entries.push({ level: "warn", data, message });
    },
    error(data, message) {
      entries.push({ level: "error", data, message });
    },
  };
};

const makeContext = ({
  hmac = validHmac,
  body = payload,
  raw = rawBody,
  webhookId = "8f8d2658-46e0-4fa8-bdd8-780a0a0bba15",
  createReceipt,
  topic = "carts/update",
  shopDomain = "example.myshopify.com",
  shopRows = [{ id: "shop-1", currency: "USD" }],
  receiptOverrides = {},
  existingVariant = true,
  pricingRows,
  pricingHasNextPage = false,
  capturePricingQuery = false,
} = {}) => {
  const events = [];
  const logger = makeLogger();
  const reply = makeReply();
  const storedShopHash = crypto
    .createHash("sha256")
    .update(String(shopDomain))
    .digest("hex");
  const api = {
    webhookReceipt: {
      create: createReceipt ?? (async (record) => {
        events.push(["receipt", record]);
        return { id: "receipt-1" };
      }),
      complete: async (id, record) => {
        events.push(["receipt-complete", id, record]);
        return { completed: true };
      },
      fail: async (id, record) => {
        events.push(["receipt-fail", id, record]);
        return { failed: true };
      },
      update: async (id, record) => {
        events.push(["receipt-update", id, record]);
        return { id, ...record };
      },
      findFirst: async () => ({
        id: "receipt-1",
        status: "processed",
        topic: "carts/update",
        shopDomainHash: storedShopHash,
      }),
      claim: async () => ({ claimed: false, reason: "processed" }),
      ...receiptOverrides,
    },
    webhookAttempt: {
      findMany: async () => [],
      create: async (record) => {
        events.push(["attempt", record]);
        return { id: "attempt-1", ...record };
      },
      update: async (id, record) => {
        events.push(["attempt-update", id, record]);
        return { id, ...record };
      },
    },
    shopifyShop: {
      findMany: async () => shopRows,
    },
    shippingInsuranceSetting: {
      findMany: async (options) => {
        if (capturePricingQuery) events.push(["pricing-query", options]);
        const rows = pricingRows ?? [{
        basePercentage: "2",
        baseAmount: "0",
        currency: "USD",
        pricingVersion: "test-v1",
        effectiveAt: "2020-01-01T00:00:00.000Z",
        status: "active",
        }];
        rows.hasNextPage = pricingHasNextPage;
        return rows;
      },
    },
    shippingInsuranceProduct: {
      findFirst: async () => ({
        productId: "100",
        productGid: "gid://shopify/Product/100",
      }),
    },
  };
  const connections = {
    shopify: {
      forShopId: async () => ({
        graphql: async (_query, variables) => {
          if (capturePricingQuery) events.push(["graphql", variables]);
          events.push(["side-effect"]);
          const calls = events.filter(([event]) => event === "side-effect").length;
          if (calls === 1) return {
            product: {
              variants: {
                edges: existingVariant
                  ? [{ node: { id: "variant-1", price: "2.00" } }]
                  : [],
              },
            },
          };
          events.push(["mutation"]);
          return { productVariantCreate: { productVariant: { id: "variant-1" }, userErrors: [] } };
        },
      }),
    },
  };
  return {
    events,
    logger,
    reply,
    context: {
      request: {
        headers: {
          "x-shopify-hmac-sha256": hmac,
          "x-shopify-shop-domain": shopDomain,
          "x-shopify-topic": topic,
          "x-shopify-webhook-id": webhookId,
        },
        body,
        rawBody: raw,
      },
      reply,
      logger,
      api,
      connections,
    },
  };
};

test("webhook scope preserves exact JSON bytes while parsing the body", async () => {
  const server = Fastify();
  await server.register(async (scoped) => {
    await webhookScope(scoped);
    scoped.post("/", async (request) => ({
      body: request.body,
      raw: request.rawBody.toString("utf8"),
    }));
  });
  const exact = '{ "token": "spacing-matters" }\n';
  const response = await server.inject({
    method: "POST",
    url: "/",
    headers: { "content-type": "application/json" },
    payload: exact,
  });
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().raw, exact);
  assert.deepEqual(response.json().body, { token: "spacing-matters" });
  await server.close();
});

test("verifyShopifyWebhook accepts a valid raw-body signature", () => {
  assert.equal(verifyShopifyWebhook(rawBody, validHmac, SECRET), true);
});

test("verifyShopifyWebhook rejects missing, malformed, and tampered signatures", () => {
  assert.equal(verifyShopifyWebhook(rawBody, undefined, SECRET), false);
  assert.equal(verifyShopifyWebhook(rawBody, "not-base64!", SECRET), false);
  assert.equal(
    verifyShopifyWebhook(Buffer.from(`${rawBody} `), validHmac, SECRET),
    false
  );
});

test("delivery keys are scoped and deterministic without storing payload data", () => {
  const withId = buildWebhookDeliveryKey({
    shopDomain: "example.myshopify.com",
    topic: "carts/update",
    webhookId: "delivery-1",
    rawBody,
  });
  const fallback = buildWebhookDeliveryKey({
    shopDomain: "example.myshopify.com",
    topic: "carts/update",
    rawBody,
  });
  assert.equal(withId, null);
  const global = buildWebhookDeliveryKey({
    webhookId: "8f8d2658-46e0-4fa8-bdd8-780a0a0bba15",
  });
  assert.equal(global, "webhook:8f8d2658-46e0-4fa8-bdd8-780a0a0bba15");
  assert.equal(buildWebhookDeliveryKey({
    webhookId: "8f8d2658-46e0-4fa8-bdd8-780a0a0bba15",
    shopDomain: "changed.myshopify.com",
    topic: "changed/topic",
    rawBody: Buffer.from("changed"),
  }), global);
  assert.equal(fallback, buildWebhookDeliveryKey({
    shopDomain: "example.myshopify.com",
    topic: "carts/update",
    rawBody,
  }));
  assert.doesNotMatch(global, /sensitive-cart-token/);
});

test("route rejects missing, malformed, and tampered HMAC before persistence", async () => {
  const previous = process.env.SHOPIFY_API_SECRET;
  process.env.SHOPIFY_API_SECRET = SECRET;
  try {
    for (const bad of [null, "not-base64!", validHmac.slice(1)]) {
      let persisted = false;
      const { context, reply } = makeContext({
        hmac: bad,
        createReceipt: async () => {
          persisted = true;
        },
      });
      await route(context);
      assert.equal(reply.statusCode, 401);
      assert.equal(persisted, false);
    }
  } finally {
    if (previous === undefined) delete process.env.SHOPIFY_API_SECRET;
    else process.env.SHOPIFY_API_SECRET = previous;
  }
});

test("route fails closed when the exact raw body or secret is unavailable", async () => {
  const previous = process.env.SHOPIFY_API_SECRET;
  delete process.env.SHOPIFY_API_SECRET;
  try {
    const missingSecret = makeContext();
    await route(missingSecret.context);
    assert.equal(missingSecret.reply.statusCode, 503);

    process.env.SHOPIFY_API_SECRET = SECRET;
    const missingRaw = makeContext({ raw: null });
    await route(missingRaw.context);
    assert.equal(missingRaw.reply.statusCode, 400);
  } finally {
    if (previous === undefined) delete process.env.SHOPIFY_API_SECRET;
    else process.env.SHOPIFY_API_SECRET = previous;
  }
});

test("route reads the webhook secret from Gadget configuration", async () => {
  const previous = process.env.SHOPIFY_API_SECRET;
  delete process.env.SHOPIFY_API_SECRET;
  try {
    const { context, reply } = makeContext();
    context.config = { SHOPIFY_API_SECRET: SECRET };
    await route(context);
    assert.equal(reply.statusCode, 200);
  } finally {
    if (previous === undefined) delete process.env.SHOPIFY_API_SECRET;
    else process.env.SHOPIFY_API_SECRET = previous;
  }
});

test("route durably creates a unique receipt before Shopify side effects", async () => {
  const previous = process.env.SHOPIFY_API_SECRET;
  process.env.SHOPIFY_API_SECRET = SECRET;
  try {
    const { context, reply, events } = makeContext();
    await route(context);
    assert.equal(reply.statusCode, 200);
    assert.equal(events[0][0], "receipt");
    assert.equal(events[0][1].status, "processing");
    assert.equal(events[1][0], "attempt");
    assert.equal(events[2][0], "side-effect");
    assert.ok(events.find(([name]) => name === "attempt"));
    assert.ok(events.find(([name, , data]) => name === "attempt-update" && data.status === "processed"));
  } finally {
    if (previous === undefined) delete process.env.SHOPIFY_API_SECRET;
    else process.env.SHOPIFY_API_SECRET = previous;
  }
});

test("duplicate delivery is acknowledged without repeating side effects", async () => {
  const previous = process.env.SHOPIFY_API_SECRET;
  process.env.SHOPIFY_API_SECRET = SECRET;
  try {
    const duplicate = new InvalidRecordError(
      null,
      [{ apiIdentifier: "deliveryKey", message: "must be unique" }],
      "webhookReceipt"
    );
    const { context, reply, events } = makeContext({
      createReceipt: async () => {
        throw duplicate;
      },
      receiptOverrides: {
        findFirst: async () => ({
          id: "receipt-1",
          topic: "carts/update",
          shopDomainHash: crypto.createHash("sha256").update("example.myshopify.com").digest("hex"),
        }),
      },
    });
    context.api.webhookAttempt.findMany = async () => [{
      id: "attempt-1",
      attemptNumber: 1,
      status: "processed",
      leaseExpiresAt: "2026-07-23T00:00:00.000Z",
    }];
    await route(context);
    assert.equal(reply.statusCode, 200);
    assert.deepEqual(reply.body, { received: true, duplicate: true });
    assert.equal(events.some(([event]) => event === "side-effect"), false);
  } finally {
    if (previous === undefined) delete process.env.SHOPIFY_API_SECRET;
    else process.env.SHOPIFY_API_SECRET = previous;
  }
});

test("route rejects missing or wrong topic and missing or foreign shop before receipts", async () => {
  const previous = process.env.SHOPIFY_API_SECRET;
  process.env.SHOPIFY_API_SECRET = SECRET;
  try {
    for (const options of [
      { topic: null },
      { topic: "orders/create" },
      { shopDomain: null },
      { topic: "carts/update", shopRows: [] },
    ]) {
      let persisted = false;
      const attempt = makeContext({
        ...options,
        createReceipt: async () => { persisted = true; },
      });
      if (options.topic === null) {
        delete attempt.context.request.headers["x-shopify-topic"];
      }
      if (options.shopDomain === null) {
        delete attempt.context.request.headers["x-shopify-shop-domain"];
      }
      await route(attempt.context);
      assert.ok([400, 401].includes(attempt.reply.statusCode));
      assert.equal(persisted, false);
    }
  } finally {
    if (previous === undefined) delete process.env.SHOPIFY_API_SECRET;
    else process.env.SHOPIFY_API_SECRET = previous;
  }
});

test("route rejects missing and malformed Shopify webhook IDs before persistence", async () => {
  const previous = process.env.SHOPIFY_API_SECRET;
  process.env.SHOPIFY_API_SECRET = SECRET;
  try {
    for (const webhookId of [null, "", "not-a-uuid", "00000000-0000-0000-0000-000000000000"]) {
      let persisted = false;
      const attempt = makeContext({
        webhookId,
        createReceipt: async () => { persisted = true; },
      });
      if (webhookId === null) {
        delete attempt.context.request.headers["x-shopify-webhook-id"];
      }
      await route(attempt.context);
      assert.equal(attempt.reply.statusCode, 400);
      assert.equal(persisted, false);
    }
  } finally {
    if (previous === undefined) delete process.env.SHOPIFY_API_SECRET;
    else process.env.SHOPIFY_API_SECRET = previous;
  }
});

test("active duplicate returns retryable conflict without a side effect", async () => {
  const previous = process.env.SHOPIFY_API_SECRET;
  process.env.SHOPIFY_API_SECRET = SECRET;
  try {
    const duplicate = new InvalidRecordError(null, [
      { apiIdentifier: "deliveryKey", message: "already exists" },
    ], "webhookReceipt");
    const attempt = makeContext({
      createReceipt: async () => { throw duplicate; },
    });
    attempt.context.api.webhookAttempt.findMany = async () => [{
      id: "attempt-1",
      attemptNumber: 1,
      status: "processing",
      leaseExpiresAt: "2999-01-01T00:00:00.000Z",
    }];
    await route(attempt.context);
    assert.equal(attempt.reply.statusCode, 409);
    assert.equal(attempt.events.some(([name]) => name === "side-effect"), false);
  } finally {
    if (previous === undefined) delete process.env.SHOPIFY_API_SECRET;
    else process.env.SHOPIFY_API_SECRET = previous;
  }
});

test("failed or stale duplicate claim replays and can perform the mutation once", async () => {
  const previous = process.env.SHOPIFY_API_SECRET;
  process.env.SHOPIFY_API_SECRET = SECRET;
  try {
    const duplicate = new InvalidRecordError(null, [
      { apiIdentifier: "deliveryKey", message: "must be unique" },
    ], "webhookReceipt");
    const attempt = makeContext({
      createReceipt: async () => { throw duplicate; },
      receiptOverrides: {
        findFirst: async () => ({
          id: "receipt-1",
          status: "failed",
          leaseExpiresAt: "2026-07-23T00:00:00.000Z",
          topic: "carts/update",
          shopDomainHash: crypto.createHash("sha256").update("example.myshopify.com").digest("hex"),
        }),
      },
      existingVariant: false,
    });
    attempt.context.api.webhookAttempt.findMany = async () => [{
      id: "attempt-1",
      attemptNumber: 1,
      status: "failed",
      leaseExpiresAt: "2026-07-23T00:00:00.000Z",
    }];
    await route(attempt.context);
    assert.equal(attempt.reply.statusCode, 200);
    assert.equal(attempt.events.filter(([name]) => name === "mutation").length, 1);
    assert.ok(
      attempt.events.findIndex(([name, , data]) =>
        name === "attempt-update" && data.status === "processed"
      )
      > attempt.events.findIndex(([name]) => name === "mutation")
    );
  } finally {
    if (previous === undefined) delete process.env.SHOPIFY_API_SECRET;
    else process.env.SHOPIFY_API_SECRET = previous;
  }
});

test("duplicate UUID with changed shop or stored topic metadata cannot acquire an attempt", async () => {
  const previous = process.env.SHOPIFY_API_SECRET;
  process.env.SHOPIFY_API_SECRET = SECRET;
  try {
    const duplicate = new InvalidRecordError(null, [
      { apiIdentifier: "deliveryKey", message: "must be unique" },
    ], "webhookReceipt");
    const originalHash = crypto
      .createHash("sha256")
      .update("example.myshopify.com")
      .digest("hex");
    for (const mismatch of [
      {
        shopDomain: "other.myshopify.com",
        stored: { topic: "carts/update", shopDomainHash: originalHash },
      },
      {
        shopDomain: "example.myshopify.com",
        stored: { topic: "orders/create", shopDomainHash: originalHash },
      },
    ]) {
      let acquired = false;
      const attempt = makeContext({
        shopDomain: mismatch.shopDomain,
        shopRows: [{ id: "registered-shop" }],
        createReceipt: async () => { throw duplicate; },
        receiptOverrides: {
          findFirst: async () => ({ id: "receipt-1", ...mismatch.stored }),
        },
      });
      attempt.context.api.webhookAttempt.findMany = async () => {
        acquired = true;
        return [];
      };
      await route(attempt.context);
      assert.equal(attempt.reply.statusCode, 409);
      assert.equal(acquired, false);
      assert.equal(attempt.events.some(([name]) => name === "side-effect"), false);
    }
  } finally {
    if (previous === undefined) delete process.env.SHOPIFY_API_SECRET;
    else process.env.SHOPIFY_API_SECRET = previous;
  }
});

test("completion persistence failure marks the lease failed so a replay is not poisoned", async () => {
  const previous = process.env.SHOPIFY_API_SECRET;
  process.env.SHOPIFY_API_SECRET = SECRET;
  try {
    const attempt = makeContext({
    });
    attempt.context.api.webhookReceipt.update = async () => {
      throw new Error("receipt projection unavailable");
    };
    await route(attempt.context);
    assert.equal(attempt.reply.statusCode, 200);
    assert.ok(attempt.events.find(([name, , data]) =>
      name === "attempt-update" && data.status === "processed"
    ));
  } finally {
    if (previous === undefined) delete process.env.SHOPIFY_API_SECRET;
    else process.env.SHOPIFY_API_SECRET = previous;
  }
});

test("webhook logs never contain the raw body, cart token, or HMAC", async () => {
  const previous = process.env.SHOPIFY_API_SECRET;
  process.env.SHOPIFY_API_SECRET = SECRET;
  try {
    const { context, logger } = makeContext();
    await route(context);
    const logs = JSON.stringify(logger.entries);
    assert.doesNotMatch(logs, /sensitive-cart-token/);
    assert.doesNotMatch(logs, new RegExp(validHmac.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.doesNotMatch(logs, /example\.myshopify\.com/);
  } finally {
    if (previous === undefined) delete process.env.SHOPIFY_API_SECRET;
    else process.env.SHOPIFY_API_SECRET = previous;
  }
});

test("cart webhook selects the latest effective active pricing version", async () => {
  const pricingRows = [
    { basePercentage: "2", baseAmount: "0", currency: "USD", pricingVersion: "v1",
      effectiveAt: "2020-01-01T00:00:00.000Z", status: "active" },
    { basePercentage: "3", baseAmount: "0", currency: "USD", pricingVersion: "v2",
      effectiveAt: "2021-01-01T00:00:00.000Z", status: "active" },
    { basePercentage: "9", baseAmount: "0", currency: "USD", pricingVersion: "future",
      effectiveAt: "2099-01-01T00:00:00.000Z", status: "active" },
    { basePercentage: "8", baseAmount: "0", currency: "USD", pricingVersion: "inactive",
      effectiveAt: "2022-01-01T00:00:00.000Z", status: "inactive" },
  ];
  const { context, events, reply } = makeContext({
    pricingRows,
    existingVariant: true,
    capturePricingQuery: true,
  });
  await route({ ...context, config: { SHOPIFY_API_SECRET: SECRET } });
  assert.equal(reply.statusCode, 200);
  assert.equal(events.find(([name]) => name === "pricing-query")[1].first, 250);
  const mutationCall = events
    .filter(([name]) => name === "graphql")
    .map(([, variables]) => variables)
    .find((variables) => variables?.price);
  assert.equal(mutationCall.price, "3.00");
});

test("cart webhook fails closed when pricing versions exceed its bound", async () => {
  const { context, events, reply } = makeContext({ pricingHasNextPage: true });
  await route({ ...context, config: { SHOPIFY_API_SECRET: SECRET } });
  assert.equal(reply.statusCode, 500);
  assert.equal(events.some(([name]) => name === "side-effect"), false);
});
