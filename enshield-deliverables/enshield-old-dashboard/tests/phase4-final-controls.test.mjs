import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  loadAndValidatePayableClaimContext,
  loadAndValidatePaymentAuthority,
} from "../api/lib/finance/paymentCreateControl.js";
import {
  claimManualReconciliationMatch,
  manualMatchKey,
} from "../api/lib/finance/reconciliationMatch.js";

test("payment authority is loaded and rejected before any receipt, payment, or audit write", async () => {
  const events = [];
  const api = {
    payableDocument: { async findFirst() {
      events.push("read-payable");
      return {
        id: "ap-1", accountingEntityId: "entity-1", claimId: "claim-1",
        claimReserveId: "reserve-1", currency: "USD", openAmountMinor: 100,
        status: "approved",
      };
    } },
    claimReserve: { async findFirst() {
      events.push("read-reserve");
      return {
        id: "reserve-1", accountingEntityId: "entity-1", claimId: "claim-1",
        currency: "USD", closingMinor: 100,
      };
    } },
    internal: new Proxy({}, { get() { events.push("write"); return {}; } }),
  };

  await assert.rejects(loadAndValidatePaymentAuthority({
    api,
    entityId: "entity-1",
    claimId: "claim-1",
    payableDocumentId: "ap-1",
    claimReserveId: "reserve-1",
    currency: "USD",
    amountMinor: 101,
  }), /open payable amount/);
  assert.deepEqual(events, ["read-payable", "read-reserve"]);
});

test("payment authority requires positive safe minor units and matching ISO currency and links", async () => {
  const base = {
    entityId: "entity-1", claimId: "claim-1", payableDocumentId: "ap-1",
    claimReserveId: "reserve-1", currency: "USD", amountMinor: 50,
  };
  const makeApi = (overrides = {}) => ({
    payableDocument: { async findFirst() {
      return {
        id: "ap-1", accountingEntityId: "entity-1", claimId: "claim-1",
        claimReserveId: "reserve-1", currency: "USD", openAmountMinor: 100,
        status: "approved", ...overrides.payable,
      };
    } },
    claimReserve: { async findFirst() {
      return {
        id: "reserve-1", accountingEntityId: "entity-1", claimId: "claim-1",
        currency: "USD", closingMinor: 100, ...overrides.reserve,
      };
    } },
  });

  await assert.rejects(loadAndValidatePaymentAuthority({ api: makeApi(), ...base, amountMinor: 0 }), /positive safe integer/);
  await assert.rejects(loadAndValidatePaymentAuthority({ api: makeApi(), ...base, amountMinor: Number.MAX_SAFE_INTEGER + 1 }), /positive safe integer/);
  await assert.rejects(loadAndValidatePaymentAuthority({ api: makeApi(), ...base, currency: "US" }), /ISO currency/);
  await assert.rejects(loadAndValidatePaymentAuthority({ api: makeApi({ reserve: { currency: "EUR" } }), ...base }), /currency must match/);
  await assert.rejects(loadAndValidatePaymentAuthority({ api: makeApi({ reserve: { claimId: "claim-2" } }), ...base }), /claim links must match/);
  await assert.rejects(loadAndValidatePaymentAuthority({ api: makeApi({ payable: { claimReserveId: "reserve-2" } }), ...base }), /reserve links must match/);
});

test("manual reconciliation match key is run and payment scoped, independent of item", () => {
  assert.equal(manualMatchKey("run-1", "payment-1"), "run-1:payment-1");
});

test("concurrent different items matching one payment have one winner and a clean 409 loser", async () => {
  const matches = [];
  let counterWrites = 0;
  let audits = 0;
  const save = async ({ key, itemId }) => {
    await new Promise((resolve) => setImmediate(resolve));
    if (matches.some((row) => row.key === key)) {
      const error = new Error("unique");
      error.name = "InvalidRecordError";
      error.code = "GGT_INVALID_RECORD";
      error.validationErrors = [{ apiIdentifier: "manualMatchKey", message: "must be unique" }];
      throw error;
    }
    matches.push({ key, itemId });
  };
  const resolve = (itemId) => claimManualReconciliationMatch({
    runId: "run-1", paymentId: "payment-1", itemId,
    findExisting: async () => matches.find((row) => row.key === "run-1:payment-1"),
    save,
    updateCounter: async () => { counterWrites += 1; },
    writeAudit: async () => { audits += 1; },
  });
  const settled = await Promise.allSettled([resolve("item-1"), resolve("item-2")]);
  assert.equal(settled.filter((result) => result.status === "fulfilled").length, 1);
  const loser = settled.find((result) => result.status === "rejected").reason;
  assert.equal(loser.statusCode, 409);
  assert.equal(counterWrites, 1);
  assert.equal(audits, 1);
});

test("same reconciliation item replay is idempotent without counter or audit writes", async () => {
  let writes = 0;
  const result = await claimManualReconciliationMatch({
    runId: "run-1", paymentId: "payment-1", itemId: "item-1",
    findExisting: async () => ({ key: "run-1:payment-1", itemId: "item-1" }),
    save: async () => { writes += 1; },
    updateCounter: async () => { writes += 1; },
    writeAudit: async () => { writes += 1; },
  });
  assert.equal(result.idempotent, true);
  assert.equal(writes, 0);
});

test("payment create persists the normalized authoritative currency before claiming a receipt", async () => {
  const source = await readFile(new URL("../api/models/claimPayment/actions/create.js", import.meta.url), "utf8");
  const validation = source.indexOf("await loadAndValidatePaymentAuthority");
  const normalization = source.indexOf("record.currency = authority.currency");
  const receipt = source.indexOf("claimOperationalOperation", validation);
  assert.ok(validation >= 0 && normalization > validation && receipt > normalization);
});

test("payable claim context rejects a foreign or mismatched reserve before any write", async () => {
  const events = [];
  const api = {
    claim: { async findFirst() {
      events.push("read-claim");
      return { id: "claim-1" };
    } },
    claimReserve: { async findFirst() {
      events.push("read-reserve");
      return {
        id: "reserve-1", accountingEntityId: "entity-1", claimId: "claim-2",
        currency: "USD",
      };
    } },
    internal: new Proxy({}, { get() { events.push("write"); return {}; } }),
  };
  await assert.rejects(loadAndValidatePayableClaimContext({
    api, shopId: "shop-1", entityId: "entity-1", claimId: "claim-1",
    claimReserveId: "reserve-1", currency: "USD",
  }), /claim links must match/);
  assert.deepEqual(events, ["read-claim", "read-reserve"]);
});

test("payable creation route passes claim links only to payable documents", async () => {
  const source = await readFile(new URL("../api/routes/api/POST-finance-operations.js", import.meta.url), "utf8");
  assert.match(source, /model === "payableDocument"[\s\S]*claim:\s*\{\s*_link:/);
  assert.match(source, /model === "payableDocument"[\s\S]*claimReserve:\s*\{\s*_link:/);
});
