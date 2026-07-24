import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "integrationDelivery-model",
  comment:
    "Metadata-only durable outbox for tenant-scoped Enshield deliveries. Payloads, credentials and customer PII must never be stored here.",
  fields: {
    deliveryKey: {
      type: "string",
      validations: { required: true, unique: true },
      storageKey: "integrationDelivery-deliveryKey",
    },
    operation: {
      type: "string",
      validations: { required: true },
      storageKey: "integrationDelivery-operation",
    },
    sourceId: {
      type: "string",
      validations: { required: true },
      storageKey: "integrationDelivery-sourceId",
    },
    status: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["queued", "processing", "succeeded", "retry", "permanent_failure"],
      validations: { required: true },
      storageKey: "integrationDelivery-status",
    },
    attemptCount: {
      type: "number",
      decimals: 0,
      validations: { required: true },
      storageKey: "integrationDelivery-attemptCount",
    },
    lastStatusCode: {
      type: "number",
      decimals: 0,
      storageKey: "integrationDelivery-lastStatusCode",
    },
    lastErrorCode: {
      type: "string",
      storageKey: "integrationDelivery-lastErrorCode",
    },
    lastAttemptAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "integrationDelivery-lastAttemptAt",
    },
    nextAttemptAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "integrationDelivery-nextAttemptAt",
    },
    leaseExpiresAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "integrationDelivery-leaseExpiresAt",
    },
    completedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "integrationDelivery-completedAt",
    },
    metadata: {
      type: "json",
      storageKey: "integrationDelivery-metadata",
    },
    shop: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "shopifyShop" },
      storageKey: "integrationDelivery-shop",
    },
  },
};
