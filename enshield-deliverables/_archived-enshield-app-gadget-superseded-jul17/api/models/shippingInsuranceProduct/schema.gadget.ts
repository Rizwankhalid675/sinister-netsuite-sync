import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "shippingInsuranceProduct" model, go to https://enshield-shipping-protection.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "VQ2iF1YtzviB",
  comment:
    "This model represents a shipping insurance product in Shopify, storing the product and variant IDs for the insurance product added to carts, and the shop it belongs to.",
  fields: {
    productGid: { type: "string", storageKey: "p8-beANElz8c" },
    productId: {
      type: "string",
      validations: { required: true },
      storageKey: "0ZjtTUHZpZod",
    },
    shop: {
      type: "belongsTo",
      validations: { required: true, unique: true },
      parent: { model: "shopifyShop" },
      storageKey: "ppf25dPnfpfc",
    },
    variantGid: { type: "string", storageKey: "zkmY3XKCY4gn" },
    variantId: {
      type: "string",
      validations: { required: true },
      storageKey: "cZO7AIACALYi",
    },
  },
};
