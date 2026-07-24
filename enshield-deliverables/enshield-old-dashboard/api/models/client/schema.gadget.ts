import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "client" model, go to https://enshield-shipping-protection.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "client-model",
  comment:
    "A Shopify store represented as a first-class Enshield admin record (one client per shop). Backfilled from shopifyShop. Derived fields (valueInTransit, claimCount) are cached, not sources of truth.",
  fields: {
    claimCount: {
      type: "number",
      decimals: 0,
      storageKey: "client-claimCount",
    },
    claims: {
      type: "hasMany",
      children: { model: "claim", belongsToField: "client" },
      storageKey: "client-claims",
    },
    createdByEmail: {
      type: "string",
      storageKey: "client-createdByEmail",
    },
    plan: { type: "string", storageKey: "client-plan" },
    shop: {
      type: "belongsTo",
      validations: { required: true, unique: true },
      parent: { model: "shopifyShop" },
      storageKey: "client-shop",
    },
    status: {
      type: "enum",
      default: "onboarding",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["active", "paused", "onboarding", "churned"],
      validations: { required: true },
      storageKey: "client-status",
    },
    storeId: {
      type: "string",
      validations: { required: true },
      storageKey: "client-storeId",
    },
    storeName: {
      type: "string",
      validations: { required: true },
      storageKey: "client-storeName",
    },
    valueInTransit: {
      type: "number",
      decimals: 2,
      storageKey: "client-valueInTransit",
    },
    valueInTransitMinor: {
      type: "number",
      decimals: 0,
      storageKey: "client-valueInTransitMinor",
    },
    valueInTransitCurrency: {
      type: "string",
      storageKey: "client-valueInTransitCurrency",
    },
  },
};
