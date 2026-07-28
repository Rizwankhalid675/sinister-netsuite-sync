import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "appUser" model, go to https://enshield-shipping-protection.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "appUser-model",
  comment:
    "An administration user of the Enshield internal dashboard. Belongs to a shop (tenancy) and an appRole (RBAC). Soft-deactivated rather than hard-deleted. Carries audit fields.",
  fields: {
    accessScope: {
      type: "enum",
      default: "department",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["all_stores", "specific_stores", "department"],
      validations: { required: true },
      storageKey: "appUser-accessScope",
    },
    allowedShopIds: {
      type: "json",
      default: [],
      storageKey: "appUser-allowedShopIds",
    },
    createdByEmail: {
      type: "string",
      storageKey: "appUser-createdByEmail",
    },
    department: {
      type: "enum",
      default: "none",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "none",
        "finance",
        "claims",
        "operations",
        "support",
        "administration",
      ],
      storageKey: "appUser-department",
    },
    email: {
      type: "email",
      validations: { required: true },
      storageKey: "appUser-email",
    },
    emailConfirmationExpiresAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "appUser-emailConfirmationExpiresAt",
    },
    emailConfirmationToken: {
      type: "string",
      storageKey: "appUser-emailConfirmationToken",
    },
    emailConfirmed: {
      type: "boolean",
      default: false,
      storageKey: "appUser-emailConfirmed",
    },
    lastLoginAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "appUser-lastLoginAt",
    },
    mustChangePassword: {
      type: "boolean",
      default: true,
      storageKey: "appUser-mustChangePassword",
    },
    name: {
      type: "string",
      validations: { required: true },
      storageKey: "appUser-name",
    },
    passwordHash: {
      type: "string",
      storageKey: "appUser-passwordHash",
    },
    passwordResetExpiresAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "appUser-passwordResetExpiresAt",
    },
    passwordResetToken: {
      type: "string",
      storageKey: "appUser-passwordResetToken",
    },
    personId: {
      type: "string",
      validations: { required: true },
      storageKey: "appUser-personId",
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
    shopPersonKey: {
      type: "string",
      validations: { required: true, unique: true },
      storageKey: "appUser-shopPersonKey",
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
    tempPasswordIssuedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "appUser-tempPasswordIssuedAt",
    },
    updatedByEmail: {
      type: "string",
      storageKey: "appUser-updatedByEmail",
    },
  },
};
