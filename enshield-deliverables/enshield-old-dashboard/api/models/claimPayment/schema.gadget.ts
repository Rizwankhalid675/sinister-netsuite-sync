import type { GadgetModel } from "gadget-server";
export const schema: GadgetModel = { type: "gadget/model-schema/v2", storageKey: "claimPayment-model", fields: {
  accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "claimPayment-accountingEntity" },
  payableDocument: { type: "belongsTo", validations: { required: true }, parent: { model: "payableDocument" }, storageKey: "claimPayment-payableDocument" },
  claimReserve: { type: "belongsTo", validations: { required: true }, parent: { model: "claimReserve" }, storageKey: "claimPayment-claimReserve" },
  claim: { type: "belongsTo", validations: { required: true }, parent: { model: "claim" }, storageKey: "claimPayment-claim" },
  paymentKey: { type: "string", validations: { required: true, unique: true }, storageKey: "claimPayment-paymentKey" },
  externalReference: { type: "string", validations: { required: true }, storageKey: "claimPayment-externalReference" },
  currency: { type: "string", validations: { required: true }, storageKey: "claimPayment-currency" },
  amountMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "claimPayment-amountMinor" },
  initiatedBySystem: { type: "boolean", default: false, validations: { required: true }, storageKey: "claimPayment-initiatedBySystem" },
  recordedById: { type: "string", validations: { required: true }, storageKey: "claimPayment-recordedById" },
  verifiedById: { type: "string", storageKey: "claimPayment-verifiedById" },
  verifiedAt: { type: "dateTime", includeTime: true, storageKey: "claimPayment-verifiedAt" },
  status: { type: "enum", options: ["pending","verified"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "claimPayment-status" },
}};
