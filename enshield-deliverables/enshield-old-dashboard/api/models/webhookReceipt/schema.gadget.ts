import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "webhookReceipt-model",
  comment:
    "Durable idempotency receipt for authenticated Shopify webhook deliveries. Contains metadata only; raw payloads and secrets are never stored.",
  fields: {
    deliveryKey: {
      type: "string",
      validations: { required: true, unique: true },
      storageKey: "webhookReceipt-deliveryKey",
    },
    topic: {
      type: "string",
      validations: { required: true },
      storageKey: "webhookReceipt-topic",
    },
    shopDomainHash: {
      type: "string",
      validations: { required: true },
      storageKey: "webhookReceipt-shopDomainHash",
    },
    status: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["processing", "processed", "failed"],
      validations: { required: true },
      storageKey: "webhookReceipt-status",
    },
    processedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "webhookReceipt-processedAt",
    },
    failureCode: {
      type: "string",
      storageKey: "webhookReceipt-failureCode",
    },
  },
};
