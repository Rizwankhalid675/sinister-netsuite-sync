import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "financeProfile-model",
  comment: "Owner/CPA-gated finance configuration. shadowMode is invariantly true in Phase 4.",
  fields: {
    profileKey: { type: "string", validations: { required: true, unique: true }, storageKey: "financeProfile-profileKey" },
    accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "financeProfile-accountingEntity" },
    shadowMode: { type: "boolean", default: true, validations: { required: true }, storageKey: "financeProfile-shadowMode" },
    fiscalCalendar: { type: "string", storageKey: "financeProfile-fiscalCalendar" },
    approvedBy: { type: "string", storageKey: "financeProfile-approvedBy" },
    approvedAt: { type: "dateTime", includeTime: true, storageKey: "financeProfile-approvedAt" },
    ownerGateVersion: { type: "string", storageKey: "financeProfile-ownerGateVersion" },
    createdBy: { type: "string", validations: { required: true }, storageKey: "financeProfile-createdBy" },
    updatedBy: { type: "string", validations: { required: true }, storageKey: "financeProfile-updatedBy" },
  },
};

