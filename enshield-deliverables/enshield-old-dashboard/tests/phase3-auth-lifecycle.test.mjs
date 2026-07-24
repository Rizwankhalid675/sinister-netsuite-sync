import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFileSync } from "node:fs";
import test from "node:test";

import { createTrustedAuthToken, verifyTrustedAuthToken } from "../api/lib/trustedAuth.js";
import { resolveInternalOperator } from "../api/lib/internalAccess.js";
import authStart from "../api/routes/auth/GET-internal-start.js";
import authCallback from "../api/routes/auth/POST-internal-callback.js";
import authLogout from "../api/routes/auth/POST-internal-logout.js";
import { assignmentKeyFor, requireOwnerProvisioning } from "../api/lib/operatorProvisioning.js";
import { claimInternalAuthChallenge } from "../api/lib/internalAuthReceipt.js";
import { createSingleAuthExchange, logoutInternalSession } from "../web/lib/internalAuthClient.js";

const source = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const secret = randomBytes(32).toString("base64url");

function session(initial = {}) {
  const values = { ...initial };
  return {
    values,
    get(key) { return values[key]; },
    set(key, value) { values[key] = value; },
    delete(key) { delete values[key]; },
  };
}

function replyRecorder() {
  return {
    statusCode: 200, payload: null,
    code(value) { this.statusCode = value; return this; },
    async send(value) { this.payload = value; },
  };
}

test("internal start clears prior identity and replaces the challenge", async () => {
  const active = session({
    personId: "old", internalAuthenticatedAt: "2026-07-23T10:00:00Z",
    internalAuthState: "old-state", internalAuthNonce: "old-nonce",
  });
  const reply = replyRecorder();
  await authStart({
    session: active, reply,
    config: { INTERNAL_AUTH_HANDOFF_URL: "https://id.example/start", INTERNAL_AUTH_AUDIENCE: "enshield" },
  });
  assert.equal(active.values.personId, undefined);
  assert.equal(active.values.internalAuthenticatedAt, undefined);
  assert.notEqual(active.values.internalAuthState, "old-state");
  assert.notEqual(active.values.internalAuthNonce, "old-nonce");
  assert.match(reply.payload.authorizationUrl, /^https:\/\/id\.example\/start/);
});

test("callback consumes challenge and clears identity even when verification fails", async () => {
  const current = session({ personId: "old", internalAuthState: "state", internalAuthNonce: "nonce", internalAuthChallengeAt: new Date().toISOString() });
  const reply = replyRecorder();
  await authCallback({
    session: current, reply, body: { token: "bad" }, request: { body: { token: "bad" } },
    api: {}, config: {}, logger: { error() {} },
  });
  assert.equal(reply.statusCode, 503);
  assert.equal(current.values.personId, undefined);
  assert.equal(current.values.internalAuthState, undefined);
  assert.equal(current.values.internalAuthNonce, undefined);
  assert.equal(reply.payload.error, "Internal authentication failed");
});

test("logout clears identity and every outstanding auth challenge", async () => {
  const current = session({
    personId: "p1", internalAuthenticatedAt: "now",
    internalAuthState: "state", internalAuthNonce: "nonce",
  });
  const reply = replyRecorder();
  await authLogout({ session: current, reply });
  assert.deepEqual(current.values, {});
  assert.deepEqual(reply.payload, { success: true });
});

test("resolver enforces internal session max age and checks active operator each request", async () => {
  let operatorReads = 0;
  const api = {
    internalOperator: { async findFirst() { operatorReads += 1; return { id: "op", status: "active" }; } },
    operatorShopAssignment: { async findMany() { return Object.assign([], { hasNextPage: false }); } },
  };
  await assert.rejects(resolveInternalOperator({
    api,
    session: session({ personId: "p1", internalAuthenticatedAt: "2026-07-23T10:00:00.000Z" }),
    now: new Date("2026-07-23T22:01:00.000Z"),
  }), /expired/i);
  assert.equal(operatorReads, 0);
});

test("token rejects iat after exp and non-integer or excessive time ranges", () => {
  const base = {
    sub: "p1", iss: "issuer", aud: "aud", nonce: "nonce", state: "state",
  };
  for (const timing of [
    { iat: 20, exp: 10 },
    { iat: 10.5, exp: 20 },
    { iat: 10, exp: 10.5 },
    { iat: 10, exp: 311 },
  ]) {
    const token = createTrustedAuthToken({ secret, claims: { ...base, ...timing } });
    assert.throws(() => verifyTrustedAuthToken(token, {
      secret, issuer: "issuer", audience: "aud", nonce: "nonce", state: "state", now: 15,
    }));
  }
});

test("assignment keys are derived and provisioning rejects API callers", () => {
  assert.equal(assignmentKeyFor("operator-1", "shop-1"), "operator-1:shop-1");
  assert.throws(() => assignmentKeyFor("operator:1", "shop-1"), /Invalid assignment/);
  assert.throws(() => requireOwnerProvisioning({ trigger: { type: "api" } }), /Owner provisioning/);
  assert.doesNotThrow(() => requireOwnerProvisioning({ trigger: { type: "background-action" } }));
});

test("frontend has explicit internal login and callback paths outside Shopify authentication", () => {
  const app = source("web/components/App.jsx");
  const login = source("web/routes/internalLogin.jsx");
  assert.match(app, /path="internal-login"/);
  assert.match(app, /path="internal-auth\/callback"/);
  assert.match(app, /isInternalAuthPath/);
  assert.match(login, /\/auth\/internal-start/);
  assert.match(login, /window\.location\.assign/);
});

test("StrictMode setup-cleanup-setup shares one non-aborted callback exchange", async () => {
  let calls = 0;
  const exchange = createSingleAuthExchange();
  const fetchImpl = async (_url, options) => {
    calls += 1;
    assert.equal(options.signal, undefined);
    assert.equal(JSON.parse(options.body).token, "secret-token");
    return { ok: true };
  };
  const firstSetup = exchange("secret-token", fetchImpl);
  // StrictMode cleanup intentionally does not cancel the security exchange.
  const secondSetup = exchange("secret-token", fetchImpl);
  assert.equal(firstSetup, secondSetup);
  assert.equal(await secondSetup, true);
  assert.equal(calls, 1);
  assert.equal(Object.values(exchange).includes("secret-token"), false);
});

test("logout always invalidates local UI and navigates even when server is unavailable", async () => {
  const events = [];
  const result = await logoutInternalSession({
    fetchImpl: async () => { throw new Error("offline"); },
    onFailure: () => events.push("accessible-failure"),
    navigate: () => events.push("navigate"),
  });
  assert.equal(result, false);
  assert.deepEqual(events, ["accessible-failure", "navigate"]);
});

test("concurrent independent auth receipt snapshots have exactly one winner", async () => {
  const digests = new Set();
  const invalidRecord = () => Object.assign(new Error("invalid record"), {
    name: "InvalidRecordError",
    code: "GGT_INVALID_RECORD",
    validationErrors: [{
      apiIdentifier: "digest",
      message: "digest must be unique",
    }],
  });
  const apiSnapshot = () => ({
    internal: {
      internalAuthReceipt: {
        async create(values) {
          await new Promise((resolve) => setImmediate(resolve));
          if (digests.has(values.digest)) throw invalidRecord();
          digests.add(values.digest);
          return { id: "receipt", ...values };
        },
      },
    },
  });
  const results = await Promise.allSettled([
    claimInternalAuthChallenge(apiSnapshot(), { state: "s", nonce: "n", expiresAt: "2026-07-24T00:00:00Z" }),
    claimInternalAuthChallenge(apiSnapshot(), { state: "s", nonce: "n", expiresAt: "2026-07-24T00:00:00Z" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  await assert.rejects(
    claimInternalAuthChallenge(apiSnapshot(), { state: "s", nonce: "n", expiresAt: "2026-07-24T00:00:00Z" }),
    (error) => error.statusCode === 401
  );
});

test("all-client rows and exports include tenant and report metadata", () => {
  assert.match(source("api/routes/api/GET-orders.js"), /shop:\s*\{\s*id:\s*true/);
  assert.match(source("api/routes/api/GET-errors.js"), /shop:\s*\{\s*id:\s*true/);
  const reports = source("web/routes/reports.jsx");
  for (const label of ["Generated at", "Scope", "Client", "Currency", "Filters", "Truncated", "Total orders", "Total value"]) {
    assert.match(reports, new RegExp(label));
  }
  assert.match(source("web/routes/dashboard.jsx"), /esd-visually-hidden[^>]*>[^<]*(?:fulfilled|status)/i);
});
