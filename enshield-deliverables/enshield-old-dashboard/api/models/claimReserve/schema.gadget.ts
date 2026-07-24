import type { GadgetModel } from "gadget-server";
export const schema: GadgetModel = { type: "gadget/model-schema/v2", storageKey: "claimReserve-model", fields: {
  shopId: { type: "string", validations: { required: true }, storageKey: "claimReserve-shopId" },
  accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "claimReserve-accountingEntity" },
  claim: { type: "belongsTo", validations: { required: true }, parent: { model: "claim" }, storageKey: "claimReserve-claim" },
  reserveKey: { type: "string", validations: { required: true, unique: true }, storageKey: "claimReserve-reserveKey" },
  currency: { type: "string", validations: { required: true }, storageKey: "claimReserve-currency" },
  openingMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "claimReserve-openingMinor" },
  additionsMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "claimReserve-additionsMinor" },
  releasesMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "claimReserve-releasesMinor" },
  paymentsMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "claimReserve-paymentsMinor" },
  closingMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "claimReserve-closingMinor" },
  reserveRevision: { type: "number", decimals: 0, default: 0, validations: { required: true }, storageKey: "claimReserve-revision" },
}}; 
