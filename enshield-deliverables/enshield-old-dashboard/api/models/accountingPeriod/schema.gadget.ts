import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "accountingPeriod-model",
  comment: "Tenant-scoped posting period. Closed periods reject new or changed postings.",
  fields: {
    periodKey: { type: "string", validations: { required: true, unique: true }, storageKey: "accountingPeriod-periodKey" },
    accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "accountingPeriod-accountingEntity" },
    startsAt: { type: "dateTime", includeTime: true, validations: { required: true }, storageKey: "accountingPeriod-startsAt" },
    endsAt: { type: "dateTime", includeTime: true, validations: { required: true }, storageKey: "accountingPeriod-endsAt" },
    status: { type: "enum", options: ["open", "closed"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "accountingPeriod-status" },
    closedBy: { type: "string", storageKey: "accountingPeriod-closedBy" },
    closedAt: { type: "dateTime", includeTime: true, storageKey: "accountingPeriod-closedAt" },
    createdBy: { type: "string", validations: { required: true }, storageKey: "accountingPeriod-createdBy" },
  },
};

