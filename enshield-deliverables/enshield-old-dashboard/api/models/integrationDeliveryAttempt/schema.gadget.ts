import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "integrationDeliveryAttempt-model",
  comment:
    "Unique execution rights for persisted integration deliveries. The attemptKey unique constraint is the atomic boundary before any external effect.",
  fields: {
    attemptKey: {
      type: "string",
      validations: { required: true, unique: true },
      storageKey: "integrationDeliveryAttempt-attemptKey",
    },
    deliveryKey: {
      type: "string",
      validations: { required: true },
      storageKey: "integrationDeliveryAttempt-deliveryKey",
    },
    deliveryId: {
      type: "string",
      validations: { required: true },
      storageKey: "integrationDeliveryAttempt-deliveryId",
    },
    attemptNumber: {
      type: "number",
      decimals: 0,
      validations: { required: true },
      storageKey: "integrationDeliveryAttempt-attemptNumber",
    },
    status: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["processing", "succeeded", "failed"],
      validations: { required: true },
      storageKey: "integrationDeliveryAttempt-status",
    },
    leaseExpiresAt: {
      type: "dateTime",
      includeTime: true,
      validations: { required: true },
      storageKey: "integrationDeliveryAttempt-leaseExpiresAt",
    },
    completedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "integrationDeliveryAttempt-completedAt",
    },
    failureCode: {
      type: "string",
      storageKey: "integrationDeliveryAttempt-failureCode",
    },
  },
};
