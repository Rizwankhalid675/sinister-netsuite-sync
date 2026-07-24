import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "internalAuthReceipt-model",
  comment: "Unique metadata-only receipt preventing concurrent replay of a verified internal authentication challenge.",
  fields: {
    digest: { type: "string", validations: { required: true, unique: true }, storageKey: "internalAuthReceipt-digest" },
    expiresAt: { type: "dateTime", includeTime: true, validations: { required: true }, storageKey: "internalAuthReceipt-expiresAt" },
  },
};
