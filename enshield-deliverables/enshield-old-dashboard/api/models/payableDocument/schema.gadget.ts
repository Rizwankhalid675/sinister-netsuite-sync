import type { GadgetModel } from "gadget-server";
export const schema: GadgetModel = { type: "gadget/model-schema/v2", storageKey: "payableDocument-model", fields: {
  shopId: { type: "string", validations: { required: true }, storageKey: "payableDocument-shopId" },
  accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "payableDocument-accountingEntity" },
  claim: { type: "belongsTo", parent: { model: "claim" }, storageKey: "payableDocument-claim" },
  claimReserve: { type: "belongsTo", parent: { model: "claimReserve" }, storageKey: "payableDocument-claimReserve" },
  documentKey: { type: "string", validations: { required: true, unique: true }, storageKey: "payableDocument-documentKey" },
  documentNumber: { type: "string", validations: { required: true }, storageKey: "payableDocument-documentNumber" },
  currency: { type: "string", validations: { required: true }, storageKey: "payableDocument-currency" },
  amountMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "payableDocument-amountMinor" },
  openAmountMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "payableDocument-openAmountMinor" },
  status: { type: "enum", options: ["draft","approved","partially_settled","settled","void"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "payableDocument-status" },
  shadowMode: { type: "boolean", default: true, validations: { required: true }, storageKey: "payableDocument-shadowMode" },
  preparedById: { type: "string", validations: { required: true }, storageKey: "payableDocument-preparedById" },
  approvedById: { type: "string", storageKey: "payableDocument-approvedById" },
  dueAt: { type: "dateTime", includeTime: false, storageKey: "payableDocument-dueAt" },
}};
