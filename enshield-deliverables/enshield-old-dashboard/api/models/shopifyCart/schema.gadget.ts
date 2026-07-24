import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "shopifyCart" model, go to https://enshield-shipping-protection.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "DataModel-Shopify-Cart",
  fields: {},
  shopify: {
    fields: {
      note: { filterIndex: false },
      shop: { searchIndex: false },
      shopifyCreatedAt: { filterIndex: false, searchIndex: false },
      shopifyUpdatedAt: { filterIndex: false, searchIndex: false },
      token: { searchIndex: false },
    },
  },
};
