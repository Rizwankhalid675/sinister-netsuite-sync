import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "claimEvent" model, go to https://enshield-shipping-protection.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "claimEvent-model",
  comment:
    "Append-only audit trail of a claim's status transitions. One row per transition, recording who/when/from/to plus an optional note. Rows are never updated or deleted.",
  fields: {
    actorEmail: {
      type: "string",
      storageKey: "claimEvent-actorEmail",
    },
    claim: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "claim" },
      storageKey: "claimEvent-claim",
    },
    fromStatus: {
      type: "string",
      storageKey: "claimEvent-fromStatus",
    },
    note: { type: "string", storageKey: "claimEvent-note" },
    shop: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "shopifyShop" },
      storageKey: "claimEvent-shop",
    },
    toStatus: {
      type: "string",
      validations: { required: true },
      storageKey: "claimEvent-toStatus",
    },
  },
};
