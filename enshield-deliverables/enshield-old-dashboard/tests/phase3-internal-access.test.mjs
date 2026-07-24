import assert from "node:assert/strict";
import { createHmac, randomBytes } from "node:crypto";
import test from "node:test";

import {
  createTrustedAuthToken,
  verifyTrustedAuthToken,
} from "../api/lib/trustedAuth.js";
import {
  requireInternalAccess,
  selectAssignedShops,
} from "../api/lib/internalAccess.js";
import authCallback from "../api/routes/auth/POST-internal-callback.js";

function page(rows) {
  return Object.assign(rows, { hasNextPage: false, endCursor: null });
}

test("trusted auth token verifies signature, issuer, audience, expiry, nonce, and state", () => {
  const now = 1784840000;
  const secret = randomBytes(32).toString("base64url");
  const token = createTrustedAuthToken({
    secret,
    claims: {
      sub: "idp|operator-1", iss: "https://identity.example",
      aud: "enshield-internal", exp: now + 60, iat: now,
      nonce: "nonce-1", state: "state-1", email: "ops@example.test",
    },
  });
  const claims = verifyTrustedAuthToken(token, {
    secret, issuer: "https://identity.example", audience: "enshield-internal",
    nonce: "nonce-1", state: "state-1", now,
  });
  assert.equal(claims.sub, "idp|operator-1");
  for (const override of [
    { secret: randomBytes(32).toString("base64url") },
    { issuer: "https://evil.example" },
    { audience: "other" },
    { nonce: "wrong" },
    { state: "wrong" },
    { now: now + 120 },
  ]) {
    assert.throws(() => verifyTrustedAuthToken(token, {
      secret, issuer: "https://identity.example", audience: "enshield-internal",
      nonce: "nonce-1", state: "state-1", now, ...override,
    }));
  }
});

test("callback sets personId only after verified token and active operator lookup", async () => {
  const secret = randomBytes(32).toString("base64url");
  const sessionData = { internalAuthState: "state", internalAuthNonce: "nonce", internalAuthChallengeAt: "2026-07-23T20:53:20.000Z" };
  const session = {
    get(key) { return sessionData[key]; },
    set(key, value) { sessionData[key] = value; },
    delete(key) { delete sessionData[key]; },
  };
  const token = createTrustedAuthToken({
    secret,
    claims: {
      sub: "operator-1", iss: "https://identity.example", aud: "enshield-internal",
      exp: 1784840060, iat: 1784840000, nonce: "nonce", state: "state",
    },
  });
  let response;
  await authCallback({
    session,
    api: { internal: { internalAuthReceipt: { async create() {} } }, internalOperator: { async findFirst(options) {
      assert.equal(options.filter.AND[0].personId.equals, "operator-1");
      assert.equal(options.filter.AND[1].status.equals, "active");
      return { id: "op-1", personId: "operator-1", status: "active" };
    } } },
    config: {
      INTERNAL_AUTH_SHARED_SECRET: secret,
      INTERNAL_AUTH_ISSUER: "https://identity.example",
      INTERNAL_AUTH_AUDIENCE: "enshield-internal",
    },
    body: { token },
    request: { body: { token } },
    reply: { code() { return this; }, async send(body) { response = body; } },
    logger: { error() {} },
    nowSeconds: 1784840000,
  });
  assert.equal(response.success, true);
  assert.equal(sessionData.personId, "operator-1");
  assert.equal(sessionData.internalAuthState, undefined);
});

test("assigned shop selection never accepts an unassigned requested tenant", () => {
  const assignments = [
    { shopId: "s1", status: "active", role: { name: "Operations Manager" } },
    { shopId: "s2", status: "active", role: { name: "Claims Agent" } },
  ];
  assert.deepEqual(selectAssignedShops(assignments, "view_orders"), ["s1", "s2"]);
  assert.deepEqual(selectAssignedShops(assignments, "view_errors"), ["s1"]);
  assert.throws(
    () => selectAssignedShops(assignments, "view_orders", "s3"),
    /Forbidden/
  );
});

test("permission is evaluated independently per assignment, never unioned across shops", () => {
  const assignments = [
    { shopId: "admin-shop", status: "active", role: { name: "Administrator" } },
    { shopId: "audit-shop", status: "active", role: { name: "Read-Only Auditor" } },
  ];
  assert.deepEqual(
    selectAssignedShops(assignments, "manage_settings", "admin-shop"),
    ["admin-shop"]
  );
  assert.throws(
    () => selectAssignedShops(assignments, "manage_settings", "audit-shop"),
    /Forbidden/
  );
  assert.deepEqual(selectAssignedShops(assignments, "view_reports"), [
    "admin-shop",
    "audit-shop",
  ]);
});

test("internal resolver loads active operator assignments and fails closed", async () => {
  const api = {
    internalOperator: { async findFirst() { return { id: "op1", personId: "p1", status: "active", name: "Ops" }; } },
    operatorShopAssignment: { async findMany(options) {
      assert.equal(options.filter.AND[0].operatorId.equals, "op1");
      return page([{ id: "a1", shopId: "s1", status: "active", role: { name: "Operations Manager" } }]);
    } },
  };
  const session = { get(key) { return { personId: "p1", internalAuthenticatedAt: "2026-07-23T17:46:40.000Z" }[key]; } };
  const access = await requireInternalAccess({ api, session, now: new Date("2026-07-23T18:00:00.000Z") }, "view_orders");
  assert.deepEqual(access.shopIds, ["s1"]);
  await assert.rejects(
    requireInternalAccess({ api, session: { get() {} } }, "view_orders"),
    /Authentication required/
  );
});

test("trusted token format is HMAC protected and never accepts alg none", () => {
  const payload = Buffer.from(JSON.stringify({ sub: "attacker" })).toString("base64url");
  const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString("base64url")}.${payload}.`;
  assert.throws(() => verifyTrustedAuthToken(none, {
    secret: createHmac("sha256", "x").update("x").digest("base64url"),
    issuer: "x", audience: "x", nonce: "x", state: "x",
  }));
});
