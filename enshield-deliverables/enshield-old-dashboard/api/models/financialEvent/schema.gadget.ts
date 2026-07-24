import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "financialEvent-model",
  comment: "Immutable normalized shadow-ledger input. Unique sourceVersionKey provides replay idempotency.",
  fields: {
    sourceVersionKey: { type: "string", validations: { required: true, unique: true }, storageKey: "financialEvent-sourceVersionKey" },
    accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "financialEvent-accountingEntity" },
    sourceSystem: { type: "string", validations: { required: true }, storageKey: "financialEvent-sourceSystem" },
    sourceId: { type: "string", validations: { required: true }, storageKey: "financialEvent-sourceId" },
    sourceVersion: { type: "string", validations: { required: true }, storageKey: "financialEvent-sourceVersion" },
    eventType: { type: "string", validations: { required: true }, storageKey: "financialEvent-eventType" },
    occurredAt: { type: "dateTime", includeTime: true, validations: { required: true }, storageKey: "financialEvent-occurredAt" },
    currency: { type: "string", validations: { required: true }, storageKey: "financialEvent-currency" },
    amountMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "financialEvent-amountMinor" },
    status: { type: "enum", options: ["received", "journaled", "rejected"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "financialEvent-status" },
    metadata: { type: "json", storageKey: "financialEvent-metadata" },
    recordedBy: { type: "string", validations: { required: true }, storageKey: "financialEvent-recordedBy" },
  },
};

