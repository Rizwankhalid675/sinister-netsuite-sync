import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "legacyOrder" model, go to https://enshield-shipping-protection.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "legacy-order-model",
  comment:
    "PII-minimized operational order imported read-only from the legacy Laravel/Nova dashboard.",
  fields: {
    claims: {
      type: "hasMany",
      children: {
        model: "legacyClaim",
        belongsToField: "legacyOrder",
      },
      storageKey: "legacy-order-claims",
    },
    client: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "client" },
      storageKey: "legacy-order-client",
    },
    currency: {
      type: "string",
      validations: { required: true },
      storageKey: "legacy-order-currency",
    },
    isShipped: {
      type: "boolean",
      default: false,
      storageKey: "legacy-order-isShipped",
    },
    legacyId: {
      type: "string",
      validations: { required: true },
      storageKey: "legacy-order-legacyId",
    },
    orderNumber: {
      type: "string",
      validations: { required: true },
      storageKey: "legacy-order-orderNumber",
    },
    placedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "legacy-order-placedAt",
    },
    platform: {
      type: "string",
      validations: { required: true },
      storageKey: "legacy-order-platform",
    },
    protectionCostMinor: {
      type: "number",
      decimals: 0,
      storageKey: "legacy-order-protectionCostMinor",
    },
    shippingMinor: {
      type: "number",
      decimals: 0,
      storageKey: "legacy-order-shippingMinor",
    },
    sourceKey: {
      type: "string",
      validations: { required: true, unique: true },
      storageKey: "legacy-order-sourceKey",
    },
    status: { type: "string", storageKey: "legacy-order-status" },
    taxMinor: {
      type: "number",
      decimals: 0,
      storageKey: "legacy-order-taxMinor",
    },
    trackingNumber: {
      type: "string",
      storageKey: "legacy-order-trackingNumber",
    },
    valueMinor: {
      type: "number",
      decimals: 0,
      storageKey: "legacy-order-valueMinor",
    },
  },
};
