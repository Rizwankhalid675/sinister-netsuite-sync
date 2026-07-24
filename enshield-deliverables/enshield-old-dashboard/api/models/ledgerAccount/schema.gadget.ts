import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "ledgerAccount-model",
  comment: "Conservative test chart account; production chart requires written owner/CPA approval.",
  fields: {
    accountKey: { type: "string", validations: { required: true, unique: true }, storageKey: "ledgerAccount-accountKey" },
    accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "ledgerAccount-accountingEntity" },
    code: { type: "string", validations: { required: true }, storageKey: "ledgerAccount-code" },
    name: { type: "string", validations: { required: true }, storageKey: "ledgerAccount-name" },
    type: { type: "enum", options: ["asset", "liability", "equity", "revenue", "expense"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "ledgerAccount-type" },
    currency: { type: "string", validations: { required: true }, storageKey: "ledgerAccount-currency" },
    status: { type: "enum", options: ["active", "inactive"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "ledgerAccount-status" },
    createdBy: { type: "string", validations: { required: true }, storageKey: "ledgerAccount-createdBy" },
    updatedBy: { type: "string", validations: { required: true }, storageKey: "ledgerAccount-updatedBy" },
  },
};

