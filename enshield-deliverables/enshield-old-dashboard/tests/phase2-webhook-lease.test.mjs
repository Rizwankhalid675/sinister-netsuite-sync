import assert from "node:assert/strict";
import test from "node:test";
import { InvalidRecordError } from "../.gadget/client/dist-esm/connection/support.js";

import {
  hasDeliveryKeyUniqueViolation,
  acquireWebhookAttempt,
  normalizeShopDomain,
  normalizeWebhookTopic,
} from "../api/lib/webhookReceiptLease.js";

test("normalization accepts only carts/update and valid myshopify domains", () => {
  assert.equal(normalizeWebhookTopic(" CARTS/UPDATE "), "carts/update");
  assert.equal(normalizeWebhookTopic("orders/create"), null);
  assert.equal(normalizeWebhookTopic(undefined), null);
  assert.equal(normalizeShopDomain(" EXAMPLE.MyShopify.Com "), "example.myshopify.com");
  assert.equal(normalizeShopDomain("example.com"), null);
  assert.equal(normalizeShopDomain(undefined), null);
});

test("unique detection requires a deliveryKey field validation, not message text", () => {
  assert.equal(hasDeliveryKeyUniqueViolation(new InvalidRecordError(
    null,
    [{ apiIdentifier: "deliveryKey", message: "is not unique" }],
    "webhookReceipt"
  )), true);
  assert.equal(hasDeliveryKeyUniqueViolation(new Error("some unique failure")), false);
  assert.equal(hasDeliveryKeyUniqueViolation({
    code: "GGT_INVALID_RECORD",
    name: "InvalidRecordError",
    validationErrors: [{ apiIdentifier: "topic", message: "is not unique" }],
  }), false);
});

test("independent concurrent snapshots acquire only one database-unique attempt", async () => {
  const rows = [];
  const api = {
    webhookAttempt: {
      findMany: async () => rows.map((row) => ({ ...row })).slice(-1),
      create: async (input) => {
        await new Promise((resolve) => setImmediate(resolve));
        if (rows.some((row) => row.attemptKey === input.attemptKey)) {
          throw new InvalidRecordError(
            null,
            [{ apiIdentifier: "attemptKey", message: "must be unique" }],
            "webhookAttempt"
          );
        }
        const created = { id: `attempt-${rows.length + 1}`, ...input };
        rows.push(created);
        return { ...created };
      },
    },
  };
  const now = new Date("2026-07-23T12:00:00.000Z");
  const results = await Promise.all([
    acquireWebhookAttempt(api, "webhook:delivery", { now }),
    acquireWebhookAttempt(api, "webhook:delivery", { now }),
  ]);
  assert.equal(results.filter(({ acquired }) => acquired).length, 1);
  assert.equal(rows.length, 1);
});
