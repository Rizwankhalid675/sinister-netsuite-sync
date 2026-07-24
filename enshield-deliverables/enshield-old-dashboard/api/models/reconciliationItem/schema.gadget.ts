import type { GadgetModel } from "gadget-server";
export const schema: GadgetModel = { type: "gadget/model-schema/v2", storageKey: "reconciliationItem-model", fields: {
  accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "reconciliationItem-accountingEntity" },
  reconciliationRun: { type: "belongsTo", validations: { required: true }, parent: { model: "reconciliationRun" }, storageKey: "reconciliationItem-run" },
  itemKey: { type: "string", validations: { required: true, unique: true }, storageKey: "reconciliationItem-itemKey" },
  externalReference: { type: "string", validations: { required: true }, storageKey: "reconciliationItem-externalReference" },
  currency: { type: "string", validations: { required: true }, storageKey: "reconciliationItem-currency" },
  amountMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "reconciliationItem-amountMinor" },
  status: { type: "enum", options: ["matched","exception"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "reconciliationItem-status" },
  matchedClaimPayment: { type: "belongsTo", parent: { model: "claimPayment" }, storageKey: "reconciliationItem-matchedPayment" },
  manualMatchKey: { type: "string", validations: { unique: true }, storageKey: "reconciliationItem-manualMatchKey" },
  evidenceCode: { type: "string", storageKey: "reconciliationItem-evidenceCode" },
  resolutionReason: { type: "string", storageKey: "reconciliationItem-resolutionReason" },
  resolvedById: { type: "string", storageKey: "reconciliationItem-resolvedById" },
  resolvedAt: { type: "dateTime", includeTime: true, storageKey: "reconciliationItem-resolvedAt" },
}};
