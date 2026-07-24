import type { GadgetModel } from "gadget-server";
export const schema: GadgetModel = { type: "gadget/model-schema/v2", storageKey: "reconciliationRun-model", fields: {
  shopId: { type: "string", validations: { required: true }, storageKey: "reconciliationRun-shopId" },
  accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "reconciliationRun-accountingEntity" },
  operationKey: { type: "string", validations: { required: true, unique: true }, storageKey: "reconciliationRun-operationKey" },
  status: { type: "enum", options: ["processing","completed","failed"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "reconciliationRun-status" },
  unresolvedCount: { type: "number", decimals: 0, validations: { required: true }, storageKey: "reconciliationRun-unresolvedCount" },
  preparedById: { type: "string", validations: { required: true }, storageKey: "reconciliationRun-preparedById" },
  completedById: { type: "string", storageKey: "reconciliationRun-completedById" },
}};
