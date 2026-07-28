import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "appRole" model, go to https://enshield-shipping-protection.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "appRole-model",
  comment:
    "An administration role for the Enshield internal dashboard. Defines a named role and its permission grants (JSON list). Global definitions, not shop-scoped. Seeded with the 10 standard roles.",
  fields: {
    description: {
      type: "string",
      storageKey: "appRole-description",
    },
    name: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "Super Admin",
        "Administrator",
        "Claims Manager",
        "Claims Agent",
        "Finance Manager",
        "Accountant",
        "Operations Manager",
        "Support Agent",
        "Read-Only Auditor",
        "Staff",
      ],
      validations: { required: true, unique: true },
      storageKey: "appRole-name",
    },
    permissions: {
      type: "json",
      validations: { required: true },
      storageKey: "appRole-permissions",
    },
    users: {
      type: "hasMany",
      children: { model: "appUser", belongsToField: "role" },
      storageKey: "appRole-users",
    },
  },
};
