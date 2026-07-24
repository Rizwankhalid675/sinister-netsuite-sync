import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "webhookAttempt-model",
  comment:
    "Unique per-delivery processing claims. The attemptKey unique constraint is the atomic persistence boundary preventing concurrent webhook side effects.",
  fields: {
    attemptKey: {
      type: "string",
      validations: { required: true, unique: true },
      storageKey: "webhookAttempt-attemptKey",
    },
    deliveryKey: {
      type: "string",
      validations: { required: true },
      storageKey: "webhookAttempt-deliveryKey",
    },
    attemptNumber: {
      type: "number",
      validations: { required: true },
      storageKey: "webhookAttempt-attemptNumber",
    },
    status: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["processing", "processed", "failed"],
      validations: { required: true },
      storageKey: "webhookAttempt-status",
    },
    leaseExpiresAt: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "webhookAttempt-leaseExpiresAt",
    },
    failureCode: {
      type: "string",
      storageKey: "webhookAttempt-failureCode",
    },
  },
};
