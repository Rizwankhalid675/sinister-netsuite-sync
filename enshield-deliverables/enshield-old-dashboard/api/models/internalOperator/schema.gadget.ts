import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "internalOperator-model",
  comment: "Owner-provisioned internal operator bound to a cryptographically verified external person identifier.",
  fields: {
    personId: { type: "string", validations: { required: true, unique: true }, storageKey: "internalOperator-personId" },
    name: { type: "string", validations: { required: true }, storageKey: "internalOperator-name" },
    email: { type: "email", validations: { required: true }, storageKey: "internalOperator-email" },
    status: { type: "enum", default: "invited", acceptMultipleSelections: false, acceptUnlistedOptions: false, options: ["active", "invited", "deactivated"], validations: { required: true }, storageKey: "internalOperator-status" },
    assignments: { type: "hasMany", children: { model: "operatorShopAssignment", belongsToField: "operator" }, storageKey: "internalOperator-assignments" },
  },
};
