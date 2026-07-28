import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "client" model, go to https://enshield-shipping-protection.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "client-model",
  comment:
    "An Enshield merchant from Shopify, Miva, or a linked Gadget shop. Derived fields are cached, not sources of truth.",
  fields: {
    apiEnabled: {
      type: "boolean",
      default: false,
      storageKey: "client-apiEnabled",
    },
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
    customerSince: {
      type: "dateTime",
      includeTime: false,
      storageKey: "client-customerSince",
    },
    legacyClaims: {
      type: "hasMany",
      children: { model: "legacyClaim", belongsToField: "client" },
      storageKey: "client-legacyClaims",
    },
    legacyOrders: {
      type: "hasMany",
      children: { model: "legacyOrder", belongsToField: "client" },
      storageKey: "client-legacyOrders",
    },
    legacySourceKey: {
      type: "string",
      validations: { unique: true },
      storageKey: "client-legacySourceKey",
    },
    legacyStoreId: {
      type: "string",
      storageKey: "client-legacyStoreId",
    },
    plan: { type: "string", storageKey: "client-plan" },
    platform: { type: "string", storageKey: "client-platform" },
    shop: {
      type: "belongsTo",
      validations: { unique: true },
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
    valueInTransitCurrency: {
      type: "string",
      storageKey: "client-valueInTransitCurrency",
    },
    valueInTransitMinor: {
      type: "number",
      decimals: 0,
      storageKey: "client-valueInTransitMinor",
    },
  },
};
