import type { GadgetModel } from "gadget-server";
export const schema: GadgetModel = { type: "gadget/model-schema/v2", storageKey: "receivableDocument-model", fields: {
  shopId: { type: "string", validations: { required: true }, storageKey: "receivableDocument-shopId" },
  accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "receivableDocument-accountingEntity" },
  documentKey: { type: "string", validations: { required: true, unique: true }, storageKey: "receivableDocument-documentKey" },
  documentNumber: { type: "string", validations: { required: true }, storageKey: "receivableDocument-documentNumber" },
  currency: { type: "string", validations: { required: true }, storageKey: "receivableDocument-currency" },
  amountMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "receivableDocument-amountMinor" },
  openAmountMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "receivableDocument-openAmountMinor" },
  status: { type: "enum", options: ["draft","approved","partially_settled","settled","void"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "receivableDocument-status" },
  shadowMode: { type: "boolean", default: true, validations: { required: true }, storageKey: "receivableDocument-shadowMode" },
  preparedById: { type: "string", validations: { required: true }, storageKey: "receivableDocument-preparedById" },
  approvedById: { type: "string", storageKey: "receivableDocument-approvedById" },
  dueAt: { type: "dateTime", includeTime: false, storageKey: "receivableDocument-dueAt" },
}};
