import type { GadgetModel } from "gadget-server";
export const schema: GadgetModel = { type: "gadget/model-schema/v2", storageKey: "claimReserveMovement-model", fields: {
  accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "claimReserveMovement-accountingEntity" },
  claimReserve: { type: "belongsTo", validations: { required: true }, parent: { model: "claimReserve" }, storageKey: "claimReserveMovement-reserve" },
  operationKey: { type: "string", validations: { required: true, unique: true }, storageKey: "claimReserveMovement-operationKey" },
  currency: { type: "string", validations: { required: true }, storageKey: "claimReserveMovement-currency" },
  movementType: { type: "enum", options: ["opening","addition","release","payment"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "claimReserveMovement-type" },
  amountMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "claimReserveMovement-amount" },
  effectiveAt: { type: "dateTime", includeTime: true, validations: { required: true }, storageKey: "claimReserveMovement-effectiveAt" },
}};
