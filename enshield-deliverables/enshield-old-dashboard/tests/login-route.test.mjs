import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword } from "../api/lib/authPassword.js";
import { requireIdentity } from "../api/lib/permissions.js";
import { requireInternalAccess } from "../api/lib/internalAccess.js";
import login from "../api/routes/auth/POST-login.js";

function session(initial = {}) {
  const values = { ...initial };
  return {
    values,
    get(key) { return values[key]; },
    set(key, value) { values[key] = value; },
  };
}

function replyRecorder() {
  return {
    statusCode: 200,
    payload: null,
    code(value) { this.statusCode = value; return this; },
    async send(value) { this.payload = value; },
  };
}

test("standalone credential login establishes the shop and person session", async () => {
  const current = session();
  const reply = replyRecorder();
  const passwordHash = await hashPassword("correct-horse-battery");

  await login({
    body: { email: "admin@example.com", password: "correct-horse-battery" },
    request: { body: {} },
    session: current,
    reply,
    logger: { error() {} },
    api: {
      appUser: {
        async findMany() {
          return Object.assign([{
            id: "user-1",
            personId: "person-1",
            shopId: "shop-1",
            status: "active",
            emailConfirmed: true,
            passwordHash,
            mustChangePassword: false,
          }], { hasNextPage: false });
        },
      },
    },
  });

  assert.equal(reply.statusCode, 200);
  assert.deepEqual(reply.payload, { success: true, mustChangePassword: false });
  assert.deepEqual(current.values.shop, { _link: "shop-1" });
  assert.equal(current.values.shopId, undefined);
  assert.deepEqual(current.values.roles, ["shopify-app-users"]);
  assert.equal(current.values.personId, "person-1");

  const identity = await requireIdentity({
    session: {
      get(key) {
        if (key === "shop" || key === "shopId") return undefined;
        if (key === "roles") return ["unauthenticated"];
        return current.get(key);
      },
    },
    api: {
      shopifyShop: { async findFirst() { return { id: "shop-1" }; } },
      appUser: { async findMany() {
        return Object.assign([{
          id: "user-1", name: "Admin", email: "admin@example.com",
          personId: "person-1", status: "active", accessScope: "all_stores",
          shopId: "shop-1",
          allowedShopIds: [], department: "administration",
          mustChangePassword: false, role: { name: "Super Admin" },
        }], { hasNextPage: false });
      } },
    },
  });
  assert.equal(identity.roleKey, "Super Admin");

  const access = await requireInternalAccess({
    session: current,
    api: {
      internalOperator: { async maybeFindFirst() { return null; } },
      shopifyShop: { async findFirst() { return { id: "shop-1" }; } },
      appUser: { async findMany() {
        return Object.assign([{
          id: "user-1", name: "Admin", email: "admin@example.com",
          personId: "person-1", shopId: "shop-1", status: "active",
          accessScope: "all_stores", allowedShopIds: [],
          department: "administration", mustChangePassword: false,
          role: { name: "Super Admin" },
        }], { hasNextPage: false });
      } },
    },
  }, "view_dashboard");
  assert.deepEqual(access.shopIds, ["shop-1"]);
  assert.equal(access.includesLegacy, true);
});
