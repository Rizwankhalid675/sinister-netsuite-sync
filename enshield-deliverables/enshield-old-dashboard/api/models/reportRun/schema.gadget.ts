import type { GadgetModel } from "gadget-server";
export const schema: GadgetModel = { type: "gadget/model-schema/v2", storageKey: "reportRun-model", fields: {
  shopId: { type: "string", validations: { required: true }, storageKey: "reportRun-shopId" },
  accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "reportRun-accountingEntity" },
  operationKey: { type: "string", validations: { required: true, unique: true }, storageKey: "reportRun-operationKey" },
  reportType: { type: "enum", options: ["trial_balance","ledger_detail","ar_ageing","ap_ageing","reserve_roll_forward","payment_register","reconciliation_exceptions","audit_export"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "reportRun-reportType" },
  status: { type: "enum", options: ["processing","completed","failed"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "reportRun-status" },
  parametersJson: { type: "json", storageKey: "reportRun-parametersJson" },
  rowCount: { type: "number", decimals: 0, storageKey: "reportRun-rowCount" },
}};
