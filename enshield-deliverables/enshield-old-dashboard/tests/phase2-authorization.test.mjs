import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  PERMISSIONS,
  ROLE_GRANTS,
  ROLE_NAMES,
  requirePermission,
} from "../api/lib/permissions.js";
import { permissions as gadgetPermissions } from "../accessControl/permissions.gadget.ts";
import updateMetafieldRoute from "../api/routes/api/POST-update-metafield.js";
import { run as createInsuranceVariants } from "../api/actions/createInsuranceVariants.js";
import { run as sendOrderToEnshield } from "../api/actions/sendOrderToEnshield.js";
import { run as setupShippingInsuranceProduct } from "../api/actions/setupShippingInsuranceProduct.js";

const source = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const sessionFor = ({
  roles = ["shopify-app-users"],
  shopId = "shop-1",
} = {}) => ({
  get(key) {
    return { roles, shopId, shopifySID: "sid-1" }[key];
  },
});

const authorizedApi = () => ({
  shopifyShop: {
    async findFirst(options) {
      assert.deepEqual(options.filter.id, { equals: "shop-1" });
      return { id: "shop-1" };
    },
  },
});

const logger = {
  info() {},
  warn() {},
  error() {},
};

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

test("permission resolution fails closed when tenant identity is missing", async () => {
  let queried = false;
  const api = {
    shopifyShop: {
      async findFirst() {
        queried = true;
        return { id: "shop-1" };
      },
    },
  };

  await assert.rejects(
    requirePermission(
      { api, session: sessionFor({ shopId: null }) },
      PERMISSIONS.VIEW_DASHBOARD
    ),
    (error) => error.statusCode === 401 && /Authentication required/.test(error.message)
  );
  assert.equal(queried, false);
});

test("shop principal is tenant-filtered and cannot inherit any internal role grant", async () => {
  for (const permission of [
    PERMISSIONS.VIEW_DASHBOARD,
    PERMISSIONS.PAY_CLAIMS,
    PERMISSIONS.MANAGE_USERS,
    PERMISSIONS.MANAGE_ORDERS,
    PERMISSIONS.VIEW_FINANCE,
    PERMISSIONS.VIEW_AUDIT,
    PERMISSIONS.EDIT_FINANCE,
    PERMISSIONS.MANAGE_SETTINGS,
  ]) {
    await assert.rejects(
      requirePermission(
        { api: authorizedApi(), session: sessionFor() },
        permission
      ),
      (error) =>
        error.statusCode === 403 &&
        /person identity required/i.test(error.message),
      permission
    );
  }
});

test("identity endpoint uses the fail-closed internal operator resolver", () => {
  const route = source("api/routes/api/GET-me.js");
  assert.match(route, /resolveInternalOperator/);
  assert.doesNotMatch(route, /api\.internalOperator\.findFirst/);
});

test("administrative routes reject a foreign client-supplied shopId before side effects", async () => {
  let touchedShopify = false;
  const api = authorizedApi();
  const connections = {
    shopify: {
      async forShopId() {
        touchedShopify = true;
        return {
          async graphql() {
            return { metafieldsSet: { metafields: [], userErrors: [] } };
          },
        };
      },
    },
  };
  const reply = replyRecorder();

  await updateMetafieldRoute({
    request: {
      body: {
        shopId: "shop-2",
        learnMoreUrl: "https://example.com/protection",
      },
    },
    reply,
    api,
    logger,
    connections,
    session: sessionFor(),
  });

  assert.equal(reply.statusCode, 403);
  assert.equal(reply.payload?.success, false);
  assert.equal(touchedShopify, false);
});

test("internal and storefront routes use their separate authorization boundaries", () => {
  assert.match(source("api/routes/api/GET-dashboard-metrics.js"), /requireInternalAccess/);
  for (const name of ["GET-get-metafields.js", "POST-update-metafield.js"]) {
    assert.match(source(`api/routes/api/${name}`), /requireShopPermission/);
  }
});

test("direct administrative action invocation without an authenticated API context fails before side effects", async () => {
  const sideEffect = () => {
    throw new Error("side effect reached");
  };
  const context = {
    logger,
    api: new Proxy(
      {},
      {
        get: sideEffect,
      }
    ),
    connections: {
      shopify: {
        forShopId: sideEffect,
      },
    },
    config: {},
  };

  const invocations = [
    [createInsuranceVariants, { shopId: "shop-1" }],
    [sendOrderToEnshield, { orderId: "order-1", shopId: "shop-1" }],
    [setupShippingInsuranceProduct, { shopId: "shop-1" }],
  ];

  for (const [run, params] of invocations) {
    await assert.rejects(
      run({ ...context, params }),
      (error) => error.statusCode === 401 && /Authentication required/.test(error.message)
    );
  }
});

test("every global action authorizes its shop before performing work", () => {
  for (const name of [
    "createInsuranceVariants",
    "sendOrderToEnshield",
    "sendTrackingToEnshield",
    "setupInsuranceProduct",
    "setupShippingInsuranceProduct",
  ]) {
    const action = source(`api/actions/${name}.js`);
    assert.match(action, /authorizeActionShop/);
    assert.ok(
      action.indexOf("authorizeActionShop") <
        action.search(/api\.|connections\.shopify|fetch\s*\(/),
      `${name} must authorize before its first side effect`
    );
  }
});

test("direct administrative action invocation rejects a foreign shopId", async () => {
  let touchedShopify = false;

  await assert.rejects(
    setupShippingInsuranceProduct({
      params: { shopId: "shop-2" },
      trigger: { type: "api" },
      session: sessionFor(),
      api: authorizedApi(),
      logger,
      connections: {
        shopify: {
          async forShopId() {
            touchedShopify = true;
            throw new Error("side effect reached");
          },
        },
      },
    }),
    (error) => error.statusCode === 403 && /Forbidden/.test(error.message)
  );
  assert.equal(touchedShopify, false);
});

test("seeded roles are deeply immutable and share one canonical name catalog", () => {
  assert.equal(Object.isFrozen(PERMISSIONS), true);
  assert.equal(Object.isFrozen(ROLE_GRANTS), true);
  assert.equal(Object.isFrozen(ROLE_NAMES), true);
  for (const grants of Object.values(ROLE_GRANTS)) {
    assert.equal(Object.isFrozen(grants), true);
  }

  const schema = source("api/models/appRole/schema.gadget.ts");
  assert.match(schema, /import\s+\{\s*ROLE_NAMES\s*\}/);
  assert.match(schema, /options:\s*\[\.\.\.ROLE_NAMES\]/);

});

test("shopify app sessions have no direct Gadget model access to internal data", () => {
  const models = gadgetPermissions.roles["shopify-app-users"].models;
  const internalModels = [
    "appRole",
    "appUser",
    "client",
    "claim",
    "claimEvent",
    "auditLog",
  ];

  for (const modelName of internalModels) {
    assert.equal(
      models[modelName],
      undefined,
      `${modelName} must not be exposed in the public model catalog`
    );
  }
});

test("shopify app session model catalog is limited to required generated Shopify models", () => {
  const models = gadgetPermissions.roles["shopify-app-users"].models;
  assert.deepEqual(Object.keys(models).sort(), [
    "shopifyCart",
    "shopifyOrder",
    "shopifyShop",
    "shopifySync",
  ]);

  for (const [modelName, grant] of Object.entries(models)) {
    assert.match(modelName, /^shopify/);
    assert.ok(
      grant.read || Object.values(grant.actions || {}).some(Boolean),
      `${modelName} must have an explicit generated-runtime purpose`
    );
  }
});

test("append-only internal models are written only through the server-side internal API", () => {
  assert.match(
    source("api/lib/audit.js"),
    /api\.internal\.auditLog\.create/
  );
  assert.match(
    source("api/models/claim/actions/update.js"),
    /api\.internal\.claimEvent\.create/
  );
});
