import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "claim" model, go to https://enshield-shipping-protection.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "claim-model",
  comment:
    "A shipping-protection claim. Belongs to a client, a shop (tenancy), and optionally a shopifyOrder. Status transitions are enforced by the model's actions (state machine) and recorded as claimEvent rows.",
  fields: {
    claimValue: {
      type: "number",
      decimals: 2,
      storageKey: "claim-claimValue",
    },
    claimValueMinor: {
      type: "number",
      decimals: 0,
      storageKey: "claim-claimValueMinor",
    },
    claimCurrency: {
      type: "string",
      storageKey: "claim-claimCurrency",
    },
    client: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "client" },
      storageKey: "claim-client",
    },
    createdByEmail: {
      type: "string",
      storageKey: "claim-createdByEmail",
    },
    customerEmail: {
      type: "email",
      storageKey: "claim-customerEmail",
    },
    events: {
      type: "hasMany",
      children: { model: "claimEvent", belongsToField: "claim" },
      storageKey: "claim-events",
    },
    order: {
      type: "belongsTo",
      parent: { model: "shopifyOrder" },
      storageKey: "claim-order",
    },
    orderValue: {
      type: "number",
      decimals: 2,
      storageKey: "claim-orderValue",
    },
    orderValueMinor: {
      type: "number",
      decimals: 0,
      storageKey: "claim-orderValueMinor",
    },
    orderCurrency: {
      type: "string",
      storageKey: "claim-orderCurrency",
    },
    reason: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "Lost in transit",
        "Damaged",
        "Stolen / Porch piracy",
        "Not delivered",
        "Wrong item received",
        "Other",
      ],
      validations: { required: true },
      storageKey: "claim-reason",
    },
    shop: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "shopifyShop" },
      storageKey: "claim-shop",
    },
    status: {
      type: "enum",
      default: "Draft",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: [
        "Draft",
        "Submitted",
        "New",
        "Under Review",
        "Awaiting Customer",
        "Awaiting Merchant",
        "Awaiting Carrier",
        "Approved",
        "Partially Approved",
        "Denied",
        "Payment Pending",
        "Paid",
        "Closed",
        "Reopened",
        "Cancelled",
      ],
      validations: { required: true },
      storageKey: "claim-status",
    },
    updatedByEmail: {
      type: "string",
      storageKey: "claim-updatedByEmail",
    },
  },
};
