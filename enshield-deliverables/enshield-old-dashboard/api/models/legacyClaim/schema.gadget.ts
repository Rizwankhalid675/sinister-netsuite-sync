import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "legacyClaim" model, go to https://enshield-shipping-protection.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "legacy-claim-model",
  comment:
    "PII-minimized claim imported read-only from the legacy Laravel/Nova dashboard.",
  fields: {
    claimValueMinor: {
      type: "number",
      decimals: 0,
      storageKey: "legacy-claim-valueMinor",
    },
    client: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "client" },
      storageKey: "legacy-claim-client",
    },
    currency: {
      type: "string",
      validations: { required: true },
      storageKey: "legacy-claim-currency",
    },
    legacyId: {
      type: "string",
      validations: { required: true },
      storageKey: "legacy-claim-legacyId",
    },
    legacyOrder: {
      type: "belongsTo",
      parent: { model: "legacyOrder" },
      storageKey: "legacy-claim-order",
    },
    platform: {
      type: "string",
      validations: { required: true },
      storageKey: "legacy-claim-platform",
    },
    sourceKey: {
      type: "string",
      validations: { required: true, unique: true },
      storageKey: "legacy-claim-sourceKey",
    },
    status: { type: "string", storageKey: "legacy-claim-status" },
    submittedAt: {
      type: "dateTime",
      includeTime: true,
      storageKey: "legacy-claim-submittedAt",
    },
  },
};
