import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "operatorShopAssignment-model",
  comment: "Least-privilege operator membership in one client shop. Owner provisioning only.",
  fields: {
    assignmentKey: { type: "string", validations: { required: true, unique: true }, storageKey: "operatorShopAssignment-key" },
    operator: { type: "belongsTo", validations: { required: true }, parent: { model: "internalOperator" }, storageKey: "operatorShopAssignment-operator" },
    shop: { type: "belongsTo", validations: { required: true }, parent: { model: "shopifyShop" }, storageKey: "operatorShopAssignment-shop" },
    role: { type: "belongsTo", validations: { required: true }, parent: { model: "appRole" }, storageKey: "operatorShopAssignment-role" },
    status: { type: "enum", default: "active", acceptMultipleSelections: false, acceptUnlistedOptions: false, options: ["active", "suspended", "revoked"], validations: { required: true }, storageKey: "operatorShopAssignment-status" },
    createdByPersonId: { type: "string", storageKey: "operatorShopAssignment-createdBy" },
  },
};
