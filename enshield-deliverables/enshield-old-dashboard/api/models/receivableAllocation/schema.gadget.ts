import type { GadgetModel } from "gadget-server";
export const schema: GadgetModel = { type: "gadget/model-schema/v2", storageKey: "receivableAllocation-model", fields: {
  accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "receivableAllocation-accountingEntity" },
  receivableDocument: { type: "belongsTo", validations: { required: true }, parent: { model: "receivableDocument" }, storageKey: "receivableAllocation-document" },
  operationKey: { type: "string", validations: { required: true, unique: true }, storageKey: "receivableAllocation-operationKey" },
  currency: { type: "string", validations: { required: true }, storageKey: "receivableAllocation-currency" },
  amountMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "receivableAllocation-amountMinor" },
}};
