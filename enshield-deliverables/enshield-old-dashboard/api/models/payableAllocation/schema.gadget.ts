import type { GadgetModel } from "gadget-server";
export const schema: GadgetModel = { type: "gadget/model-schema/v2", storageKey: "payableAllocation-model", fields: {
  accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "payableAllocation-accountingEntity" },
  payableDocument: { type: "belongsTo", validations: { required: true }, parent: { model: "payableDocument" }, storageKey: "payableAllocation-document" },
  operationKey: { type: "string", validations: { required: true, unique: true }, storageKey: "payableAllocation-operationKey" },
  currency: { type: "string", validations: { required: true }, storageKey: "payableAllocation-currency" },
  amountMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "payableAllocation-amountMinor" },
}};
