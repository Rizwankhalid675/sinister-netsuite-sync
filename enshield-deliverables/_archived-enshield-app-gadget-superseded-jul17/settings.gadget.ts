import type { GadgetSettings } from "gadget-server";

export const settings: GadgetSettings = {
  type: "gadget/settings/v1",
  frameworkVersion: "v1.5.0",
  plugins: {
    connections: {
      shopify: {
        apiVersion: "2026-01",
        enabledModels: [
          "shopifyOrder",
          "shopifyProduct",
          "shopifyProductVariant",
        ],
        type: "partner",
        scopes: [
          "read_products",
          "write_products",
          "read_orders",
          "write_orders",
        ],
      },
    },
  },
};
