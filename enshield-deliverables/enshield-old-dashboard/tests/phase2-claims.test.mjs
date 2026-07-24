import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PERMISSIONS,
  grantsForRole,
  requireIdentity,
} from "../api/lib/permissions.js";
import {
  permissionForClaimChange,
  requiredPermissionsForClaimUpdate,
  requireClaimChangePermission,
  validateClaimUpdateFields,
  validateClaimRelationships,
  validateMinorCurrencyPair,
} from "../api/lib/claimPolicy.js";
import {
  countOpenClaims,
  isOpenClaimStatus,
  loadOpenClaimCount,
} from "../api/lib/claimMetrics.js";
import {
  computeClientRollup,
  reconcileClientRecords,
  runClientReconciliationForShop,
} from "../api/lib/clientReconciliation.js";
import { run as reconcileClients } from "../api/actions/reconcileClients.js";
import { run as updateClaim } from "../api/models/claim/actions/update.js";
import { persistClaimMutation } from "../api/lib/claimMutation.js";

test("claim workflow assigns edit, approval, payment, reopen, and close permissions", () => {
  assert.equal(
    permissionForClaimChange("New", "Under Review"),
    PERMISSIONS.EDIT_CLAIMS
  );
  assert.equal(
    permissionForClaimChange("Under Review", "Approved"),
    PERMISSIONS.APPROVE_CLAIMS
  );
  assert.equal(
    permissionForClaimChange("Approved", "Payment Pending"),
    PERMISSIONS.PAY_CLAIMS
  );
  assert.equal(
    permissionForClaimChange("Payment Pending", "Paid"),
    PERMISSIONS.PAY_CLAIMS
  );
  assert.equal(
    permissionForClaimChange("Closed", "Reopened"),
    PERMISSIONS.APPROVE_CLAIMS
  );
  assert.equal(
    permissionForClaimChange("Paid", "Closed"),
    PERMISSIONS.APPROVE_CLAIMS
  );
});

test("roles can perform only their documented claim transitions", () => {
  const agent = grantsForRole("Claims Agent");
  const manager = grantsForRole("Claims Manager");
  const finance = grantsForRole("Finance Manager");

  assert.doesNotThrow(() =>
    requireClaimChangePermission(agent, "New", "Under Review")
  );
  assert.throws(
    () => requireClaimChangePermission(agent, "Under Review", "Approved"),
    /approve_claims/
  );
  assert.doesNotThrow(() =>
    requireClaimChangePermission(manager, "Under Review", "Approved")
  );
  assert.doesNotThrow(() =>
    requireClaimChangePermission(manager, "Closed", "Reopened")
  );
  assert.doesNotThrow(() =>
    requireClaimChangePermission(manager, "Paid", "Closed")
  );
  assert.throws(
    () => requireClaimChangePermission(agent, "Approved", "Payment Pending"),
    /pay_claims/
  );
  assert.doesNotThrow(() =>
    requireClaimChangePermission(finance, "Payment Pending", "Paid")
  );
  assert.throws(
    () => requireClaimChangePermission(finance, "New", "Under Review"),
    /edit_claims/
  );
});

test("a real personId resolves only through an active same-shop appUser membership", async () => {
  const queries = [];
  const session = {
    get(key) {
      return {
        shopId: "shop-1",
        roles: ["shopify-app-users"],
        personId: "idp-subject-1",
      }[key];
    },
  };
  const api = {
    shopifyShop: { async findFirst() { return { id: "shop-1" }; } },
    appUser: {
      async findMany(options) {
        queries.push(options);
        return Object.assign([{
          id: "user-1",
          name: "Finance",
          email: "finance@example.test",
          personId: "idp-subject-1",
          status: "active",
          role: { name: "Finance Manager" },
        }], { hasNextPage: false });
      },
    },
  };
  const identity = await requireIdentity({ api, session });
  assert.equal(identity.user.id, "user-1");
  assert.equal(identity.shopId, "shop-1");
  assert.ok(identity.permissions.includes(PERMISSIONS.PAY_CLAIMS));
  assert.deepEqual(queries[0].filter, {
    AND: [
      { shopPersonKey: { equals: "shop-1:idp-subject-1" } },
      { shopId: { equals: "shop-1" } },
      { personId: { equals: "idp-subject-1" } },
      { status: { equals: "active" } },
    ],
  });

  api.appUser.findMany = async () =>
    Object.assign([], { hasNextPage: false });
  await assert.rejects(
    requireIdentity({ api, session }),
    (error) => error.statusCode === 403
  );
});

test("same-status content edits require edit permission", () => {
  assert.equal(
    permissionForClaimChange("Under Review", "Under Review"),
    PERMISSIONS.EDIT_CLAIMS
  );
});

test("payment-only roles cannot bundle content edits into a payment transition", () => {
  assert.deepEqual(
    requiredPermissionsForClaimUpdate(
      { status: "Paid" },
      "Payment Pending"
    ),
    [PERMISSIONS.PAY_CLAIMS]
  );
  assert.deepEqual(
    requiredPermissionsForClaimUpdate(
      { status: "Paid", reason: "Damaged" },
      "Payment Pending"
    ).sort(),
    [PERMISSIONS.EDIT_CLAIMS, PERMISSIONS.PAY_CLAIMS].sort()
  );
  const finance = grantsForRole("Finance Manager");
  assert.throws(() => {
    for (const permission of requiredPermissionsForClaimUpdate(
      { status: "Paid", reason: "Damaged" },
      "Payment Pending"
    )) {
      if (!finance.includes(permission)) throw new Error(`Forbidden: ${permission}`);
    }
  }, /edit_claims/);
});

test("claim update execution denies shop sessions and Finance bundled edits before save", async () => {
  const shopSession = {
    get(key) {
      return { shopId: "shop-1", roles: ["shopify-app-users"] }[key];
    },
  };
  let sideEffects = 0;
  const baseApi = {
    shopifyShop: { async findFirst() { return { id: "shop-1" }; } },
    internal: {
      claim: { async update() { sideEffects += 1; } },
      claimEvent: { async create() { sideEffects += 1; } },
      auditLog: { async create() { sideEffects += 1; } },
    },
  };
  const record = {
    id: "claim-1",
    status: "Payment Pending",
    shopId: "shop-1",
    clientId: "client-1",
  };
  await assert.rejects(
    updateClaim({
      params: { claim: { status: "Paid" } },
      record: { ...record },
      api: baseApi,
      session: shopSession,
      logger: {},
    }),
    (error) => error.statusCode === 403
  );
  assert.equal(sideEffects, 0);

  const financeSession = {
    get(key) {
      return {
        shopId: "shop-1",
        roles: ["shopify-app-users"],
        personId: "finance-sub",
      }[key];
    },
  };
  const financeApi = {
    ...baseApi,
    appUser: {
      async findMany() {
        return Object.assign([{
          id: "finance-1",
          name: "Finance",
          email: "finance@example.test",
          personId: "finance-sub",
          status: "active",
          role: { name: "Finance Manager" },
        }], { hasNextPage: false });
      },
    },
  };
  await assert.rejects(
    updateClaim({
      params: {
        claim: { status: "Paid", reason: "Damaged" },
      },
      record: { ...record },
      api: financeApi,
      session: financeSession,
      logger: {},
    }),
    (error) => error.statusCode === 403 && /internal capability/i.test(error.message)
  );
  assert.equal(sideEffects, 0);
});

test("tenant, customer, client, and order links are immutable in general claim updates", () => {
  for (const field of ["shop", "shopId", "client", "clientId", "order", "orderId", "customerEmail"]) {
    assert.throws(
      () => validateClaimUpdateFields({ [field]: "changed" }),
      new RegExp(field.replace("Id", ""), "i")
    );
  }
  assert.doesNotThrow(() =>
    validateClaimUpdateFields({
      status: "Under Review",
      reason: "Damaged",
      claimValueMinor: 1200,
      claimCurrency: "USD",
      transitionNote: "reviewed",
    })
  );
});

test("claim money requires a safe nonnegative minor-unit amount and ISO currency pair", () => {
  assert.deepEqual(validateMinorCurrencyPair(1234, "usd", "claim"), {
    amountMinor: 1234,
    currency: "USD",
  });
  for (const [amount, currency] of [
    [1.5, "USD"],
    [-1, "USD"],
    [Number.MAX_SAFE_INTEGER + 1, "USD"],
    [100, null],
    [null, "USD"],
    [100, "US"],
  ]) {
    assert.throws(
      () => validateMinorCurrencyPair(amount, currency, "claim"),
      /claim/i
    );
  }
});

test("claim relationships must resolve through explicit same-shop filters", async () => {
  const calls = [];
  const api = {
    client: {
      async findFirst(options) {
        calls.push(["client", options]);
        return { id: "client-1", shopId: "shop-1" };
      },
    },
    shopifyOrder: {
      async findFirst(options) {
        calls.push(["order", options]);
        return { id: "order-1", shopId: "shop-1" };
      },
    },
  };

  await validateClaimRelationships({
    api,
    shopId: "shop-1",
    clientId: "client-1",
    orderId: "order-1",
  });

  assert.deepEqual(calls, [
    [
      "client",
      {
        filter: {
          AND: [
            { id: { equals: "client-1" } },
            { shopId: { equals: "shop-1" } },
          ],
        },
        select: { id: true },
      },
    ],
    [
      "order",
      {
        filter: {
          AND: [
            { id: { equals: "order-1" } },
            { shopId: { equals: "shop-1" } },
          ],
        },
        select: { id: true },
      },
    ],
  ]);
});

test("foreign client or order relationships fail closed", async () => {
  const api = {
    client: { async findFirst() { return null; } },
    shopifyOrder: { async findFirst() { return null; } },
  };

  await assert.rejects(
    validateClaimRelationships({
      api,
      shopId: "shop-1",
      clientId: "foreign-client",
    }),
    (error) => error.statusCode === 403 && /client/i.test(error.message)
  );

  api.client.findFirst = async () => ({ id: "client-1" });
  await assert.rejects(
    validateClaimRelationships({
      api,
      shopId: "shop-1",
      clientId: "client-1",
      orderId: "foreign-order",
    }),
    (error) => error.statusCode === 403 && /order/i.test(error.message)
  );
});

test("open-claim metrics derive from actual nonterminal statuses", () => {
  for (const status of ["Draft", "Submitted", "Approved", "Payment Pending", "Reopened"]) {
    assert.equal(isOpenClaimStatus(status), true, status);
  }
  for (const status of ["Paid", "Closed", "Denied", "Cancelled"]) {
    assert.equal(isOpenClaimStatus(status), false, status);
  }
  assert.equal(
    countOpenClaims([
      { status: "Draft" },
      { status: "Closed" },
      { status: "Payment Pending" },
      { status: "Cancelled" },
    ]),
    2
  );
});

test("open-claim loader pages to exhaustion through explicitly tenant-filtered claims", async () => {
  const filters = [];
  const second = Object.assign([{ status: "Closed" }], { hasNextPage: false });
  const first = Object.assign(
    [{ status: "Draft" }, { status: "Paid" }, { status: "Reopened" }],
    { hasNextPage: true, async nextPage() { return second; } }
  );
  const api = {
    claim: {
      async findMany(options) {
        filters.push(options.filter);
        return first;
      },
    },
  };

  assert.equal(await loadOpenClaimCount(api, "shop-1"), 2);
  assert.deepEqual(filters, [{ shopId: { equals: "shop-1" } }]);
});

test("open-claim loader counts beyond the former 5000-record boundary", async () => {
  let pageNumber = 0;
  const makePage = () => {
    pageNumber += 1;
    const page = Object.assign(
      Array.from({ length: pageNumber <= 20 ? 250 : 1 }, () => ({ status: "Draft" })),
      { hasNextPage: pageNumber <= 20, async nextPage() { return makePage(); } }
    );
    return page;
  };
  const api = { claim: { async findMany() { return makePage(); } } };
  assert.equal(await loadOpenClaimCount(api, "shop-1"), 5001);
});

test("client rollup counts same-client claims and in-transit order value", () => {
  const rollup = computeClientRollup({
    clientId: "client-1",
    claims: [
      { clientId: "client-1" },
      { client: { id: "client-1" } },
      { clientId: "client-2" },
    ],
    orders: [
      {
        currentTotalPriceSet: { shopMoney: { amount: "12.34", currencyCode: "USD" } },
        fulfillmentStatus: null,
        financialStatus: "paid",
      },
      {
        currentTotalPriceSet: { shopMoney: { amount: "7.00", currencyCode: "USD" } },
        fulfillmentStatus: "fulfilled",
        financialStatus: "paid",
      },
    ],
  });

  assert.deepEqual(rollup, {
    claimCount: 2,
    valueInTransitMinor: 1234,
    valueInTransitCurrency: "USD",
  });
});

test("reconciliation is idempotent and skips unchanged cached values", async () => {
  const updates = [];
  const api = {
    internal: {
      client: {
        async update(id, values) {
          updates.push({ id, values });
        },
      },
    },
  };
  const clients = [
    { id: "client-1", claimCount: 2, valueInTransitMinor: 1234, valueInTransitCurrency: "USD" },
    { id: "client-2", claimCount: 9, valueInTransitMinor: 9900, valueInTransitCurrency: "USD" },
  ];
  const claims = [
    { clientId: "client-1" },
    { client: { id: "client-1" } },
  ];
  const orders = [
    {
        currentTotalPriceSet: { shopMoney: { amount: "12.34", currencyCode: "USD" } },
      fulfillmentStatus: null,
      financialStatus: "paid",
    },
  ];

  const first = await reconcileClientRecords({ api, clients, claims, orders });
  assert.deepEqual(first, { examined: 2, updated: 1 });
  assert.deepEqual(updates, [
    {
      id: "client-2",
      values: {
        claimCount: 0,
        valueInTransitMinor: 1234,
        valueInTransitCurrency: "USD",
      },
    },
  ]);

  clients[1].claimCount = 0;
  clients[1].valueInTransitMinor = 1234;
  updates.length = 0;
  const second = await reconcileClientRecords({ api, clients, claims, orders });
  assert.deepEqual(second, { examined: 2, updated: 0 });
  assert.deepEqual(updates, []);
});

test("mixed or ambiguous in-transit currencies abort before any client cache write", async () => {
  const updates = [];
  const api = { internal: { client: { async update(...args) { updates.push(args); } } } };
  const clients = [{ id: "client-1", claimCount: 0 }];
  const mixedOrders = [
    {
      currentTotalPriceSet: { shopMoney: { amount: "1.00", currencyCode: "USD" } },
      fulfillmentStatus: null,
      financialStatus: "paid",
    },
    {
      currentTotalPriceSet: { shopMoney: { amount: "1.00", currencyCode: "CAD" } },
      fulfillmentStatus: null,
      financialStatus: "paid",
    },
  ];
  await assert.rejects(
    reconcileClientRecords({ api, clients, claims: [], orders: mixedOrders }),
    /currenc/i
  );
  assert.deepEqual(updates, []);
});

test("shop reconciliation explicitly tenant-filters clients, claims, and orders", async () => {
  const queries = [];
  const emptyPage = () => Object.assign([], { hasNextPage: false });
  const api = {
    client: {
      async findMany(options) {
        queries.push(["client", options.filter]);
        return emptyPage();
      },
    },
    claim: {
      async findMany(options) {
        queries.push(["claim", options.filter]);
        return emptyPage();
      },
    },
    shopifyOrder: {
      async findMany(options) {
        queries.push(["order", options.filter]);
        return emptyPage();
      },
    },
    internal: { client: { async update() {} } },
  };

  assert.deepEqual(
    await runClientReconciliationForShop({ api, shopId: "shop-1" }),
    { examined: 0, updated: 0 }
  );
  assert.deepEqual(queries, [
    ["client", { shopId: { equals: "shop-1" } }],
    ["claim", { shopId: { equals: "shop-1" } }],
    ["order", { shopId: { equals: "shop-1" } }],
  ]);
});

test("reconciliation safety abort occurs before any partial cache write", async () => {
  const updates = [];
  const clientPage = Object.assign(
    [{ id: "client-1", claimCount: 0 }],
    { hasNextPage: false }
  );
  const claimPage = Object.assign([], { hasNextPage: false });
  const overflowingOrderPage = Object.assign(
    Array.from({ length: 250 }, (_, i) => ({ id: `order-${i}` })),
    { hasNextPage: true, async nextPage() { throw new Error("must not fetch after safety abort"); } }
  );
  const api = {
    client: { async findMany() { return clientPage; } },
    claim: { async findMany() { return claimPage; } },
    shopifyOrder: { async findMany() { return overflowingOrderPage; } },
    internal: { client: { async update(...args) { updates.push(args); } } },
  };
  await assert.rejects(
    runClientReconciliationForShop({
      api,
      shopId: "shop-1",
      maxRecords: 250,
    }),
    /safety limit/i
  );
  assert.deepEqual(updates, []);
});

test("reconcile action accepts only an authorized tenant or shop-bound background call", async () => {
  const emptyPage = () => Object.assign([], { hasNextPage: false });
  const api = {
    client: { async findMany() { return emptyPage(); } },
    claim: { async findMany() { return emptyPage(); } },
    shopifyOrder: { async findMany() { return emptyPage(); } },
    internal: { client: { async update() {} } },
  };
  const logger = { info() {} };

  assert.deepEqual(
    await reconcileClients({
      api,
      session: null,
      trigger: { type: "background-action" },
      params: { shopId: "shop-1" },
      logger,
    }),
    {
      success: true,
      shopId: "shop-1",
      examined: 0,
      updated: 0,
    }
  );

  await assert.rejects(
    reconcileClients({
      api,
      session: null,
      trigger: { type: "api" },
      params: { shopId: "shop-1" },
      logger,
    }),
    (error) => error.statusCode === 401
  );
});

test("claim persistence, transition event, and audit share the transactional run boundary", () => {
  for (const file of [
    "api/models/claim/actions/create.js",
    "api/models/claim/actions/update.js",
  ]) {
    const source = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    assert.match(source, /transactional:\s*true/);
    assert.doesNotMatch(source, /export const onSuccess/);
    assert.match(source, /await persistClaimMutation/);
  }
  const update = readFileSync(
    new URL("../api/models/claim/actions/update.js", import.meta.url),
    "utf8"
  );
  assert.match(update, /createEvent:\s*statusChanged/);
  const helper = readFileSync(
    new URL("../api/lib/claimMutation.js", import.meta.url),
    "utf8"
  );
  assert.ok(helper.indexOf("await saveRecord()") < helper.indexOf("await createEvent()"));
  assert.ok(helper.indexOf("await createEvent()") < helper.indexOf("await createAudit()"));
});

test("transaction rollback leaves no partial claim artifacts and retry writes each once", async () => {
  const state = { claims: [], events: [], audits: [] };
  async function transaction(callback) {
    const snapshot = structuredClone(state);
    try {
      return await callback();
    } catch (error) {
      Object.assign(state, snapshot);
      throw error;
    }
  }
  let failAudit = true;
  const effects = {
    async saveRecord() { state.claims.push("claim-1"); },
    async createEvent() { state.events.push("transition-1"); },
    async createAudit() {
      if (failAudit) throw new Error("audit unavailable");
      state.audits.push("audit-1");
    },
  };
  await assert.rejects(
    transaction(() => persistClaimMutation(effects)),
    /audit unavailable/
  );
  assert.deepEqual(state, { claims: [], events: [], audits: [] });

  failAudit = false;
  await transaction(() => persistClaimMutation(effects));
  assert.deepEqual(state, {
    claims: ["claim-1"],
    events: ["transition-1"],
    audits: ["audit-1"],
  });
});
