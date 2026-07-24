import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "auditLog" model, go to https://enshield-shipping-protection.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "auditLog-model",
  comment:
    "Generic append-only audit log for the Enshield admin dashboard. Records who did what to which entity, with before/after JSON snapshots. Shop-scoped. Rows are never updated or deleted.",
  fields: {
    shop: {
      type: "belongsTo",
      validations: { required: true },
      parent: { model: "shopifyShop" },
      storageKey: "auditLog-shop",
    },
    accountingEntity: {
      type: "belongsTo",
      parent: { model: "accountingEntity" },
      storageKey: "auditLog-accountingEntity",
    },
    actorEmail: {
      type: "string",
      storageKey: "auditLog-actorEmail",
    },
    action: {
      type: "string",
      validations: { required: true },
      storageKey: "auditLog-action",
    },
    entityType: {
      type: "string",
      validations: { required: true },
      storageKey: "auditLog-entityType",
    },
    entityId: {
      type: "string",
      storageKey: "auditLog-entityId",
    },
    before: {
      type: "json",
      storageKey: "auditLog-before",
    },
    after: {
      type: "json",
      storageKey: "auditLog-after",
    },
  },
};
