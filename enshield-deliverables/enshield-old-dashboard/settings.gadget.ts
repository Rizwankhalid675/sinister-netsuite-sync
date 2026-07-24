import type { GadgetSettings } from "gadget-server";

export const settings: GadgetSettings = {
  type: "gadget/settings/v1",
  frameworkVersion: "v1.5.0",
  plugins: {
    connections: {
      shopify: {
        apiVersion: "2025-10",
        enabledModels: ["shopifyCart", "shopifyOrder"],
        type: "partner",
        scopes: [
          "write_checkouts",
          "write_orders",
          "write_products",
          "read_checkouts",
          "read_orders",
          "read_products",
          "write_metafields",
          "read_metafields",
        ],
        customerAuthenticationEnabled: false,
      },
    },
  },
};
