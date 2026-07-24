import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "appUser" model, go to https://enshield-shipping-protection.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "appUser-model",
  comment:
    "An administration user of the Enshield internal dashboard. Belongs to a shop (tenancy) and an appRole (RBAC). Soft-deactivated rather than hard-deleted. Carries audit fields.",
  fields: {
    createdByEmail: {
      type: "string",
      storageKey: "appUser-createdByEmail",
    },
    email: {
      type: "email",
      validations: { required: true },
      storageKey: "appUser-email",
    },
    lastLoginAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "appUser-lastLoginAt",
    },
    name: {
      type: "string",
      validations: { required: true },
      storageKey: "appUser-name",
    },
    personId: {
      type: "string",
      validations: { required: true },
      storageKey: "appUser-personId",
    },
    shopPersonKey: {
      type: "string",
      validations: { required: true, unique: true },
      storageKey: "appUser-shopPersonKey",
    },
    role: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "appRole" },
      storageKey: "appUser-role",
    },
    shop: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "shopifyShop" },
      storageKey: "appUser-shop",
    },
    status: {
      type: "enum",
      default: "invited",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["active", "invited", "deactivated"],
      validations: { required: true },
      storageKey: "appUser-status",
    },
    updatedByEmail: {
      type: "string",
      storageKey: "appUser-updatedByEmail",
    },
  },
};
