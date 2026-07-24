import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  DELIVERY_STATUS,
  claimDeliveryLease,
  completeDeliveryAttempt,
  createDeliveryKey,
  createTrackingDeliverySourceId,
  enqueueDelivery,
  replayDelivery,
  sanitizeDeliveryError,
  safeOutcomeErrorCode,
} from "../api/lib/integrationDelivery.js";
import { PERMISSIONS, grantsForRole } from "../api/lib/permissions.js";
import errorsRoute from "../api/routes/api/GET-errors.js";
import { run as sendOrder } from "../api/actions/sendOrderToEnshield.js";
import { run as sendTracking } from "../api/actions/sendTrackingToEnshield.js";
import { run as replayAction } from "../api/actions/replayIntegrationDelivery.js";
import { onSuccess as enqueueReplayProcessor } from "../api/actions/replayIntegrationDelivery.js";
import { run as sweepDeliveries } from "../api/actions/sweepIntegrationDeliveries.js";
import { onSuccess as deleteOrderOutbox } from "../api/models/shopifyOrder/actions/delete.js";
import { deliverToEnshield } from "../api/lib/enshieldDelivery.js";

function page(rows, hasNextPage = false) {
  return Object.assign(rows, { hasNextPage });
}

test("delivery keys are stable per tenant, operation, and source and differ across tenants", () => {
  assert.equal(
    createDeliveryKey({
      shopId: "shop-1",
      operation: "order.submit",
      sourceId: "gid://shopify/Order/101",
    }),
    createDeliveryKey({
      shopId: "shop-1",
      operation: "order.submit",
      sourceId: "gid://shopify/Order/101",
    })
  );
  assert.notEqual(
    createDeliveryKey({ shopId: "shop-1", operation: "order.submit", sourceId: "101" }),
    createDeliveryKey({ shopId: "shop-2", operation: "order.submit", sourceId: "101" })
  );
});

test("tracking source identity changes with tracking value without retaining that value", () => {
  const first = createTrackingDeliverySourceId("order-1", "TRACK-SECRET-1");
  const second = createTrackingDeliverySourceId("order-1", "TRACK-SECRET-2");
  assert.notEqual(first, second);
  assert.equal(first.includes("TRACK-SECRET-1"), false);
  assert.match(first, /^order-1:[a-f0-9]{64}$/);
});

test("enqueue is idempotent and persists a queued metadata-only record before processing", async () => {
  const calls = [];
  const existing = { id: "delivery-1", status: DELIVERY_STATUS.QUEUED };
  const api = {
    integrationDelivery: {
      async findFirst(options) {
        calls.push(["find", options]);
        return calls.filter(([kind]) => kind === "find").length === 1 ? null : existing;
      },
    },
    internal: {
      integrationDelivery: {
        async create(values) {
          calls.push(["create", values]);
          return existing;
        },
      },
    },
  };
  const input = {
    api,
    shopId: "shop-1",
    operation: "tracking.submit",
    sourceId: "order-1",
    metadata: { endpoint: "store-tracking-number", trackingNumber: "MUST_NOT_STORE" },
  };
  assert.equal((await enqueueDelivery(input)).id, "delivery-1");
  assert.equal((await enqueueDelivery(input)).id, "delivery-1");
  assert.equal(calls.filter(([kind]) => kind === "create").length, 1);
  const created = calls.find(([kind]) => kind === "create")[1];
  assert.equal(created.status, DELIVERY_STATUS.QUEUED);
  assert.equal(created.shop._link, "shop-1");
  assert.deepEqual(created.metadata, { endpoint: "store-tracking-number" });
  assert.equal(JSON.stringify(created).includes("MUST_NOT_STORE"), false);
});

test("lease claim prevents concurrent work and permits an expired retry lease", async () => {
  const updates = [];
  const api = {
    integrationDeliveryAttempt: {
      async findMany() {
        return page([{
          id: "attempt-1",
          attemptNumber: 1,
          status: "failed",
          leaseExpiresAt: "2026-07-23T10:00:00.000Z",
        }]);
      },
      async create(values) { return { id: "attempt-2", ...values }; },
    },
    integrationDelivery: {
      async findFirst() {
        return {
          id: "delivery-1",
          deliveryKey: "key-1",
          shopId: "shop-1",
          status: DELIVERY_STATUS.PROCESSING,
          leaseExpiresAt: "2026-07-23T10:00:00.000Z",
          attemptCount: 1,
        };
      },
    },
    internal: {
      integrationDelivery: {
        async update(id, values) {
          updates.push([id, values]);
          return { id, ...values };
        },
      },
    },
  };
  assert.equal(
    await claimDeliveryLease({
      api,
      deliveryId: "delivery-1",
      shopId: "shop-1",
      now: new Date("2026-07-23T09:59:00.000Z"),
    }),
    null
  );
  const claimed = await claimDeliveryLease({
    api,
    deliveryId: "delivery-1",
    shopId: "shop-1",
    now: new Date("2026-07-23T10:01:00.000Z"),
  });
  assert.equal(claimed.status, DELIVERY_STATUS.PROCESSING);
  assert.equal(claimed.attemptCount, 2);
  assert.equal(claimed.attemptId, "attempt-2");
  assert.equal(updates.length, 1);
});

test("independent concurrent snapshots acquire only one unique delivery attempt", async () => {
  const attemptKeys = new Set();
  const uniqueError = () => Object.assign(new Error("not unique"), {
    code: "GGT_INVALID_RECORD",
    name: "InvalidRecordError",
    validationErrors: [{ apiIdentifier: "attemptKey", message: "must be unique" }],
  });
  const makeApi = () => ({
    integrationDelivery: {
      async findFirst() {
        return {
          id: "delivery-1",
          deliveryKey: "key-1",
          shopId: "shop-1",
          status: DELIVERY_STATUS.QUEUED,
          attemptCount: 0,
        };
      },
    },
    integrationDeliveryAttempt: {
      async findMany() { return page([]); },
      async create(values) {
        await new Promise((resolve) => setImmediate(resolve));
        if (attemptKeys.has(values.attemptKey)) throw uniqueError();
        attemptKeys.add(values.attemptKey);
        return { id: "attempt-1", ...values };
      },
    },
    internal: {
      integrationDelivery: {
        async update(id, values) { return { id, ...values }; },
      },
    },
  });
  const [left, right] = await Promise.all([
    claimDeliveryLease({ api: makeApi(), deliveryId: "delivery-1", shopId: "shop-1" }),
    claimDeliveryLease({ api: makeApi(), deliveryId: "delivery-1", shopId: "shop-1" }),
  ]);
  assert.equal([left, right].filter(Boolean).length, 1);
  assert.deepEqual([...attemptKeys], ["key-1:attempt:1"]);
});

test("retry scheduling is bounded exponential and becomes permanent after max attempts", async () => {
  const writes = [];
  const api = {
    internal: {
      integrationDelivery: {
        async update(id, values) {
          writes.push(values);
          return { id, ...values };
        },
      },
    },
  };
  const retry = await completeDeliveryAttempt({
    api,
    delivery: { id: "d1", attemptCount: 2 },
    outcome: {
      ok: false,
      retryable: true,
      statusCode: 503,
      errorCode: "token=secret customer@example.com",
      error: new Error("token=secret customer@example.com"),
    },
    now: new Date("2026-07-23T10:00:00.000Z"),
    maxAttempts: 4,
    baseDelayMs: 1000,
  });
  assert.equal(retry.status, DELIVERY_STATUS.RETRY);
  assert.equal(retry.nextAttemptAt, "2026-07-23T10:00:02.000Z");
  assert.equal(retry.lastErrorCode, "HTTP_503");
  assert.equal(JSON.stringify(retry).includes("secret"), false);
  assert.equal(JSON.stringify(retry).includes("customer@example.com"), false);

  const permanent = await completeDeliveryAttempt({
    api,
    delivery: { id: "d2", attemptCount: 4 },
    outcome: { ok: false, retryable: true, statusCode: 503, error: new Error("unavailable") },
    now: new Date("2026-07-23T10:00:00.000Z"),
    maxAttempts: 4,
  });
  assert.equal(permanent.status, DELIVERY_STATUS.PERMANENT_FAILURE);
  assert.equal(permanent.nextAttemptAt, null);
});

test("successful delivery clears lease and failure metadata", async () => {
  let values;
  const api = { internal: { integrationDelivery: { async update(id, input) { values = input; return { id, ...input }; } } } };
  await completeDeliveryAttempt({
    api,
    delivery: { id: "d1", attemptCount: 1 },
    outcome: { ok: true, statusCode: 200 },
    now: new Date("2026-07-23T10:00:00.000Z"),
  });
  assert.equal(values.status, DELIVERY_STATUS.SUCCEEDED);
  assert.equal(values.leaseExpiresAt, null);
  assert.equal(values.lastErrorCode, null);
});

test("replay requires a permanently failed same-tenant delivery and writes audit", async () => {
  const effects = [];
  const api = {
    integrationDelivery: {
      async findFirst(options) {
        effects.push(["find", options]);
        return { id: "d1", shopId: "shop-1", status: DELIVERY_STATUS.PERMANENT_FAILURE };
      },
    },
    internal: {
      integrationDelivery: {
        async update(id, values) {
          effects.push(["update", id, values]);
          return { id, ...values };
        },
      },
      auditLog: { async create(values) { effects.push(["audit", values]); } },
    },
  };
  const replayed = await replayDelivery({
    api,
    deliveryId: "d1",
    shopId: "shop-1",
    actor: { email: "ops@example.test" },
    now: new Date("2026-07-23T10:00:00.000Z"),
  });
  assert.equal(replayed.status, DELIVERY_STATUS.QUEUED);
  assert.equal(effects[0][1].filter.AND[1].shopId.equals, "shop-1");
  assert.equal(effects.some(([kind]) => kind === "audit"), true);
});

test("error sanitizer returns metadata-only classification without PII or secrets", () => {
  const sanitized = sanitizeDeliveryError(
    new Error("Authorization: Bearer abc123; jane@example.com; tracking 1Z999"),
    401
  );
  assert.deepEqual(sanitized, { code: "HTTP_401", retryable: false });
});

test("only allowlisted internal outcome codes are persisted", () => {
  assert.equal(safeOutcomeErrorCode("TRACKING_NOT_FOUND", "HTTP_500"), "TRACKING_NOT_FOUND");
  assert.equal(safeOutcomeErrorCode("customer@example.test token=secret", "HTTP_500"), "HTTP_500");
});

test("errors permissions are granted only to appropriate operational roles", () => {
  assert.ok(grantsForRole("Super Admin").includes(PERMISSIONS.VIEW_ERRORS));
  assert.ok(grantsForRole("Operations Manager").includes(PERMISSIONS.VIEW_ERRORS));
  assert.ok(grantsForRole("Operations Manager").includes(PERMISSIONS.REPLAY_DELIVERIES));
  assert.equal(grantsForRole("Claims Agent").includes(PERMISSIONS.REPLAY_DELIVERIES), false);
});

test("GET-errors is permission-gated, tenant-scoped, filtered, paginated, and redacted", async () => {
  const queries = [];
  const api = {
    internalOperator: { async findFirst() { return { id: "op-1", personId: "ops-1", status: "active" }; } },
    operatorShopAssignment: {
      async findMany() {
        return page([{
          id: "a1",
          shopId: "shop-1",
          status: "active",
          role: { name: "Operations Manager" },
        }]);
      },
    },
    integrationDelivery: {
      async findMany(options) {
        queries.push(options);
        return page([{
          id: "d1",
          deliveryKey: "safe-delivery-key",
          operation: "order.submit",
          sourceId: "customer@example.test",
          status: DELIVERY_STATUS.PERMANENT_FAILURE,
          attemptCount: 5,
          lastStatusCode: 503,
          lastErrorCode: "HTTP_503",
          nextAttemptAt: null,
          updatedAt: "2026-07-23T10:00:00Z",
          metadata: { endpoint: "order" },
        }]);
      },
    },
  };
  const session = { get(key) { return { shopId: "shop-1", roles: ["shopify-app-users"], personId: "ops-1", internalAuthenticatedAt: new Date().toISOString() }[key]; } };
  let response;
  const reply = {
    code() { return this; },
    async send(value) { response = value; },
  };
  await errorsRoute({
    api,
    session,
    logger: { error() {} },
    query: { status: "permanent_failure", operation: "order.submit", first: "25" },
    reply,
  });
  assert.equal(response.success, true);
  assert.equal(response.errors.length, 1);
  assert.equal(JSON.stringify(response).includes("payload"), false);
  assert.equal(JSON.stringify(response).includes("customer@example.test"), false);
  assert.equal(response.errors[0].sourceRef, "safe-delivery-");
  assert.deepEqual(queries[0].filter, {
    AND: [
      { shopId: { equals: "shop-1" } },
      { status: { equals: "permanent_failure" } },
      { operation: { equals: "order.submit" } },
    ],
  });
  assert.equal(queries[0].first, 25);
});

test("GET-errors rejects invalid filters instead of silently widening the query", async () => {
  const api = {
    internalOperator: { async findFirst() { return { id: "op-1", personId: "ops", status: "active" }; } },
    operatorShopAssignment: {
      async findMany() {
        return page([{ id: "a1", shopId: "shop-1", status: "active", role: { name: "Operations Manager" } }]);
      },
    },
    integrationDelivery: { async findMany() { throw new Error("must not query"); } },
  };
  const session = { get(key) { return { shopId: "shop-1", roles: ["shopify-app-users"], personId: "ops", internalAuthenticatedAt: new Date().toISOString() }[key]; } };
  let status;
  let body;
  const reply = { code(value) { status = value; return this; }, async send(value) { body = value; } };
  await errorsRoute({ api, session, logger: { error() {} }, query: { status: "succeeded", operation: "../secret" }, reply });
  assert.equal(status, 400);
  assert.equal(body.success, false);
});

test("order and tracking entry actions persist an outbox row and never call fetch directly", async () => {
  const created = [];
  const enqueues = [];
  const api = {
    integrationDelivery: { async findFirst() { return null; } },
    internal: {
      integrationDelivery: {
        async create(values) {
          created.push(values);
          return { id: `d${created.length}`, ...values };
        },
      },
    },
    processIntegrationDelivery: { name: "processIntegrationDelivery" },
    async enqueue(action, params) {
      enqueues.push({ action, params, createdCount: created.length });
    },
  };
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    throw new Error("entry actions must not call the network");
  };
  try {
    const common = {
      api,
      session: null,
      trigger: { type: "background-action" },
      logger: { info() {} },
      params: { shopId: "shop-1", orderId: "gid://shopify/Order/101" },
    };
    assert.deepEqual(await sendOrder(common), {
      success: true,
      queued: true,
      deliveryId: "d1",
      duplicate: false,
      processorEnqueued: true,
    });
    assert.deepEqual(
      await sendTracking({
        ...common,
        params: { ...common.params, trackingNumber: "sensitive-value" },
      }),
      {
        success: true,
        queued: true,
        deliveryId: "d2",
        duplicate: false,
        processorEnqueued: true,
      }
    );
    assert.equal(JSON.stringify(created).includes("sensitive-value"), false);
    assert.deepEqual(created.map(({ operation }) => operation), [
      "order.submit",
      "tracking.submit",
    ]);
    assert.equal(created[1].sourceId.includes("sensitive-value"), false);
    assert.equal(created[1].metadata.resourceId, "gid://shopify/Order/101");
    assert.deepEqual(enqueues.map(({ createdCount }) => createdCount), [1, 2]);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("a processor enqueue failure never removes the already durable delivery", async () => {
  let created = false;
  const api = {
    integrationDelivery: { async findFirst() { return null; } },
    internal: {
      integrationDelivery: {
        async create(values) { created = true; return { id: "d1", ...values }; },
      },
    },
    processIntegrationDelivery: {},
    async enqueue() { assert.equal(created, true); throw new Error("queue unavailable"); },
  };
  const result = await sendOrder({
    api,
    session: null,
    trigger: { type: "background-action" },
    params: { shopId: "shop-1", orderId: "101" },
    logger: { info() {}, warn() {} },
  });
  assert.equal(created, true);
  assert.deepEqual(result, {
    success: true,
    queued: true,
    deliveryId: "d1",
    duplicate: false,
    processorEnqueued: false,
  });
});

test("replay action enforces replay permission before mutation", async () => {
  let mutations = 0;
  const api = {
    shopifyShop: { async findFirst() { return { id: "shop-1" }; } },
    appUser: {
      async findMany() {
        return page([{
          id: "claims-1",
          email: "claims@example.test",
          personId: "claims-1",
          status: "active",
          role: { name: "Claims Agent" },
        }]);
      },
    },
    internal: {
      integrationDelivery: { async update() { mutations += 1; } },
      auditLog: { async create() { mutations += 1; } },
    },
    integrationDelivery: { async findFirst() { mutations += 1; } },
  };
  const session = { get(key) { return { shopId: "shop-1", roles: ["shopify-app-users"], personId: "claims-1" }[key]; } };
  await assert.rejects(
    replayAction({
      api,
      session,
      trigger: { type: "api" },
      params: { shopId: "shop-1", deliveryId: "d1" },
      logger: { info() {} },
    }),
    (error) => error.statusCode === 403
  );
  assert.equal(mutations, 0);
});

test("replay processor enqueue happens only in post-commit onSuccess", async () => {
  const events = [];
  await enqueueReplayProcessor({
    result: { deliveryId: "d1", shopId: "shop-1" },
    api: {
      processIntegrationDelivery: {},
      async enqueue(_action, params) { events.push(params); },
    },
    logger: { info() {}, warn() {} },
  });
  assert.deepEqual(events, [{ deliveryId: "d1", shopId: "shop-1" }]);
});

test("replay reset and audit use a transactional run while processor enqueue is post-commit", () => {
  const source = readFileSync(
    new URL("../api/actions/replayIntegrationDelivery.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /transactional:\s*true/);
  const [runSource, onSuccessSource] = source.split("export const onSuccess");
  assert.doesNotMatch(runSource, /api\.enqueue/);
  assert.match(onSuccessSource, /enqueueDeliveryProcessor/);
});

test("sweep exhaustively pages due tenant deliveries within a safety bound and enqueues each", async () => {
  const enqueued = [];
  const second = page([{ id: "d3" }]);
  const first = page([{ id: "d1" }, { id: "d2" }], true);
  first.endCursor = "cursor-d2";
  const api = {
    integrationDelivery: {
      async findMany(options) {
        assert.equal(options.filter.AND[0].shopId.equals, "shop-1");
        return options.after === "cursor-d2" ? second : first;
      },
    },
    processIntegrationDelivery: {},
    async enqueue(_action, params) { enqueued.push(params); },
  };
  const result = await sweepDeliveries({
    api,
    session: null,
    trigger: { type: "background-action" },
    params: { shopId: "shop-1", maxRecords: 10 },
    logger: { info() {}, warn() {} },
  });
  assert.deepEqual(result, {
    success: true,
    examined: 3,
    enqueued: 3,
    continuationEnqueued: false,
    shopId: "shop-1",
  });
  assert.deepEqual(enqueued.map(({ deliveryId }) => deliveryId), ["d1", "d2", "d3"]);
});

test("tenant sweep processes exact bound and bound-plus-one using a cursor continuation", async () => {
  for (const count of [250, 251]) {
    const jobs = [];
    const rows = page(
      Array.from({ length: 250 }, (_, index) => ({ id: `d-${index}` })),
      count === 251
    );
    rows.endCursor = count === 251 ? "cursor-250" : null;
    const api = {
      integrationDelivery: { async findMany() { return rows; } },
      processIntegrationDelivery: {},
      sweepIntegrationDeliveries: {},
      async enqueue(action, params, options) { jobs.push({ action, params, options }); },
    };
    const result = await sweepDeliveries({
      api,
      session: null,
      trigger: { type: "background-action" },
      params: { shopId: "shop-1", maxRecords: 250 },
      logger: { info() {}, warn() {} },
    });
    assert.equal(result.examined, 250);
    assert.equal(result.enqueued, 250);
    assert.equal(result.continuationEnqueued, count === 251);
    assert.equal(
      jobs.filter(({ action }) => action === api.processIntegrationDelivery).length,
      250
    );
    if (count === 251) {
      const continuation = jobs.at(-1);
      assert.deepEqual(continuation.params, {
        shopId: "shop-1",
        maxRecords: 250,
        after: "cursor-250",
      });
      assert.match(continuation.options.id, /^delivery-sweep-/);
    }
  }
});

test("tenant cursor continuation drains the next page", async () => {
  const jobs = [];
  const rows = page([{ id: "d-251" }]);
  const api = {
    integrationDelivery: {
      async findMany(options) {
        assert.equal(options.after, "cursor-250");
        return rows;
      },
    },
    processIntegrationDelivery: {},
    sweepIntegrationDeliveries: {},
    async enqueue(action, params, options) { jobs.push({ action, params, options }); },
  };
  const result = await sweepDeliveries({
    api,
    session: null,
    trigger: { type: "background-action" },
    params: {
      shopId: "shop-1",
      maxRecords: 250,
      after: "cursor-250",
    },
    logger: { info() {}, warn() {} },
  });
  assert.deepEqual(result, {
    success: true,
    examined: 1,
    enqueued: 1,
    continuationEnqueued: false,
    shopId: "shop-1",
  });
});

test("maxRecords 251 over 500 deliveries processes d0 through d250 without cursor skips", async () => {
  const processed = [];
  const queries = [];
  const continuations = [];
  const api = {
    integrationDelivery: {
      async findMany(options) {
        queries.push({ first: options.first, after: options.after });
        const start = options.after === "cursor-249" ? 250 : 0;
        const rows = page(
          Array.from(
            { length: options.first },
            (_, offset) => ({ id: `d${start + offset}` })
          ),
          true
        );
        rows.endCursor =
          start === 0 ? "cursor-249" : `cursor-${start + options.first - 1}`;
        return rows;
      },
    },
    processIntegrationDelivery: {},
    sweepIntegrationDeliveries: {},
    async enqueue(action, params, options) {
      if (action === this.processIntegrationDelivery) {
        processed.push(params.deliveryId);
      } else {
        continuations.push({ params, options });
      }
    },
  };
  const result = await sweepDeliveries({
    api,
    session: null,
    trigger: { type: "background-action" },
    params: { shopId: "shop/unsafe id", maxRecords: 251 },
    logger: { info() {}, warn() {} },
  });
  assert.deepEqual(queries, [
    { first: 250, after: undefined },
    { first: 1, after: "cursor-249" },
  ]);
  assert.equal(processed.length, 251);
  assert.equal(processed[0], "d0");
  assert.equal(processed.at(-1), "d250");
  assert.equal(result.continuationEnqueued, true);
  assert.equal(continuations[0].params.after, "cursor-250");
  assert.match(continuations[0].options.queue.name, /^integration-delivery-sweep-[a-f0-9]{64}$/);
  assert.equal(continuations[0].options.queue.name.includes("shop/unsafe id"), false);
  assert.equal(continuations[0].options.queue.maxConcurrency, 1);
  let initialQueue;
  await sweepDeliveries({
    api: {
      shopifyShop: {
        async findMany() { return page([{ id: "shop/unsafe id" }]); },
      },
      sweepIntegrationDeliveries: {},
      async enqueue(_action, _params, options) { initialQueue = options.queue; },
    },
    trigger: { type: "scheduler" },
    params: {},
    logger: { info() {}, warn() {} },
  });
  assert.deepEqual(continuations[0].options.queue, initialQueue);
});

test("continuation enqueue failure preserves processed progress for the next scheduled sweep", async () => {
  const rows = page([{ id: "d1" }], true);
  rows.endCursor = "next";
  let processorJobs = 0;
  const api = {
    integrationDelivery: { async findMany() { return rows; } },
    processIntegrationDelivery: {},
    sweepIntegrationDeliveries: {},
    async enqueue(action) {
      if (action === this.processIntegrationDelivery) processorJobs += 1;
      else throw new Error("continuation queue unavailable");
    },
  };
  const result = await sweepDeliveries({
    api,
    session: null,
    trigger: { type: "background-action" },
    params: { shopId: "shop-1", maxRecords: 1 },
    logger: { info() {}, warn() {} },
  });
  assert.equal(processorJobs, 1);
  assert.equal(result.continuationEnqueued, false);
});

test("scheduled sweep enumerates registered shops and dispatches tenant-bound sweeps", async () => {
  const dispatched = [];
  const shops = page([{ id: "shop-1" }, { id: "shop-2" }]);
  const api = {
    shopifyShop: { async findMany() { return shops; } },
    sweepIntegrationDeliveries: {},
    async enqueue(_action, params) { dispatched.push(params); },
  };
  const result = await sweepDeliveries({
    api,
    trigger: { type: "scheduler" },
    params: {},
    logger: { info() {} },
  });
  assert.deepEqual(result, {
    success: true,
    shopsExamined: 2,
    sweepsEnqueued: 2,
    continuationEnqueued: false,
  });
  assert.deepEqual(dispatched, [
    { shopId: "shop-1", maxRecords: 250 },
    { shopId: "shop-2", maxRecords: 250 },
  ]);
});

test("scheduler bounds large shop pages and uses deterministic cursor continuation jobs", async () => {
  const jobs = [];
  const shops = page(
    Array.from({ length: 250 }, (_, index) => ({ id: `shop-${index}` })),
    true
  );
  shops.endCursor = "shop-cursor-250";
  const api = {
    shopifyShop: { async findMany() { return shops; } },
    sweepIntegrationDeliveries: {},
    async enqueue(action, params, options) { jobs.push({ action, params, options }); },
  };
  const input = {
    api,
    trigger: { type: "scheduler" },
    params: {},
    logger: { info() {}, warn() {} },
  };
  const first = await sweepDeliveries(input);
  const firstContinuation = jobs.at(-1);
  jobs.length = 0;
  const repeated = await sweepDeliveries(input);
  const repeatedContinuation = jobs.at(-1);
  assert.equal(first.shopsExamined, 250);
  assert.equal(first.continuationEnqueued, true);
  assert.equal(repeated.shopsExamined, 250);
  assert.equal(firstContinuation.options.id, repeatedContinuation.options.id);
  assert.deepEqual(firstContinuation.params, {
    schedulerContinuation: true,
    shopAfter: "shop-cursor-250",
  });
});

test("protected order deletion persists delete delivery before processor enqueue and never fetches", async () => {
  const events = [];
  await deleteOrderOutbox({
    record: {
      id: "gid://shopify/Order/101",
      shopId: "shop-1",
      customAttributes: [{ key: "shippingInsurance", value: "true" }],
      displayFinancialStatus: "PAID",
    },
    logger: { info() {}, warn() {}, error() {} },
    api: {
      integrationDelivery: { async findFirst() { return null; } },
      internal: {
        integrationDelivery: {
          async create(values) { events.push("persist"); return { id: "delete-1", ...values }; },
        },
      },
      processIntegrationDelivery: {},
      async enqueue() { events.push("enqueue"); },
    },
  });
  assert.deepEqual(events, ["persist", "enqueue"]);
});

test("delivery transport rebuilds tracking from Shopify and sends no credential in logs", async () => {
  const requests = [];
  const logs = [];
  const shopifyClient = {
    async graphql() {
      return {
        order: {
          fulfillments: [{ trackingInfo: [{ number: "TRACK-123" }] }],
        },
      };
    },
  };
  const result = await deliverToEnshield({
    delivery: {
      deliveryKey: "delivery-key-1",
      operation: "tracking.submit",
      sourceId: "gid://shopify/Order/101",
    },
    shopifyClient,
    apiKey: "top-secret",
    logger: { info(value) { logs.push(value); }, error(value) { logs.push(value); } },
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        async text() { return "{}"; },
      };
    },
  });
  assert.deepEqual(result, { ok: true, statusCode: 200 });
  assert.deepEqual(JSON.parse(requests[0].options.body), {
    tracking_number: "TRACK-123",
  });
  assert.equal(requests[0].options.headers["Idempotency-Key"], "delivery-key-1");
  assert.equal(JSON.stringify(logs).includes("top-secret"), false);
  assert.equal(JSON.stringify(logs).includes("TRACK-123"), false);
});

test("retry after a crash uses the same downstream idempotency key", async () => {
  const keys = [];
  const base = {
    delivery: {
      deliveryKey: "stable-delivery-key",
      operation: "tracking.submit",
      sourceId: "101",
      metadata: { resourceId: "101" },
    },
    shopifyClient: {
      async graphql() { return { order: { fulfillments: [{ trackingInfo: [{ number: "TRACK" }] }] } }; },
    },
    apiKey: "secret",
    logger: { info() {}, error() {} },
    fetchImpl: async (_url, options) => {
      keys.push(options.headers["Idempotency-Key"]);
      return { ok: true, status: 200, async text() { return "{}"; } };
    },
  };
  await deliverToEnshield(base);
  await deliverToEnshield(base);
  assert.deepEqual(keys, ["stable-delivery-key", "stable-delivery-key"]);
});

test("delivery transport classifies rate limits/server errors as retryable and client errors permanent", async () => {
  const shopifyClient = {
    async graphql() {
      return { order: { fulfillments: [{ trackingInfo: [{ number: "TRACK" }] }] } };
    },
  };
  for (const [status, retryable] of [[429, true], [503, true], [400, false]]) {
    const result = await deliverToEnshield({
      delivery: { operation: "tracking.submit", sourceId: "101" },
      shopifyClient,
      apiKey: "secret",
      logger: { info() {}, error() {} },
      fetchImpl: async () => ({
        ok: false,
        status,
        statusText: "failure",
        async text() { return "do not log this response"; },
      }),
    });
    assert.equal(result.ok, false);
    assert.equal(result.retryable, retryable);
    assert.equal(Object.hasOwn(result, "responseBody"), false);
  }
});

test("Shopify reconstruction failures become retryable metadata-only outcomes", async () => {
  const result = await deliverToEnshield({
    delivery: {
      operation: "tracking.submit",
      sourceId: "101",
      metadata: { resourceId: "101" },
    },
    shopifyClient: {
      async graphql() {
        throw new Error("customer@example.test token=secret");
      },
    },
    apiKey: "secret",
    logger: { info() {}, error() {} },
    fetchImpl: async () => {
      throw new Error("network must not run");
    },
  });
  assert.deepEqual(result, {
    ok: false,
    retryable: true,
    errorCode: "DELIVERY_FAILED",
  });
  assert.equal(JSON.stringify(result).includes("customer@example.test"), false);
});
