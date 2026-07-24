import type { GadgetModel } from "gadget-server";

// This file describes the schema for the "shippingInsuranceSetting" model, go to https://enshield-shipping-protection.gadget.app/edit to view/edit your model in Gadget
// For more information on how to update this file http://docs.gadget.dev

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "8TR6e0D-iO2L",
  fields: {
    apiEndpoint: {
      type: "string",
      validations: { required: true },
      storageKey: "rK1rdou7Og99::HnE3lk89Sr3d",
    },
    insuranceRate: {
      type: "number",
      validations: { required: true },
      storageKey: "lh0xqZTitGQm::NROTZ4sZgv1a",
    },
    shop: {
      type: "belongsTo",
      parent: { model: "shopifyShop" },
      storageKey: "4UB-aYFSI-3J::wgER7efHem5C",
    },
    status: {
      type: "enum",
      acceptMultipleSelections: false,
      acceptUnlistedOptions: false,
      options: ["active", "inactive"],
      validations: { required: true },
      storageKey: "MoU1nOx_T7xK::AZ2ArRLJ5-C_",
    },
  },
};
