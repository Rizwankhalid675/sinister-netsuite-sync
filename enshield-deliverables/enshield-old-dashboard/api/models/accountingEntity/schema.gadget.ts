import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "accountingEntity-model",
  comment: "Tenant-scoped legal/accounting boundary for the shadow ledger. Owner/CPA approval is required before external use.",
  fields: {
    entityKey: { type: "string", validations: { required: true, unique: true }, storageKey: "accountingEntity-entityKey" },
    name: { type: "string", validations: { required: true }, storageKey: "accountingEntity-name" },
    baseCurrency: { type: "string", validations: { required: true }, storageKey: "accountingEntity-baseCurrency" },
    status: { type: "enum", options: ["draft", "active", "suspended"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "accountingEntity-status" },
    shop: { type: "belongsTo", validations: { required: true }, parent: { model: "shopifyShop" }, storageKey: "accountingEntity-shop" },
    createdBy: { type: "string", validations: { required: true }, storageKey: "accountingEntity-createdBy" },
    updatedBy: { type: "string", validations: { required: true }, storageKey: "accountingEntity-updatedBy" },
  },
};

