import {
  authorizeActionShop,
  PERMISSIONS,
} from "../lib/permissions.js";

/** @type { ActionRun } */
export const run = async ({
  params,
  logger,
  api,
  connections,
  session,
  trigger,
}) => {
  const shopId = await authorizeActionShop(
    { api, session, trigger, params },
    PERMISSIONS.MANAGE_STOREFRONT_CONFIGURATION
  );
  let { shopifyProductId } = params;

  logger.info({ event: "insurance_product_setup_started" }, "Setting up insurance product");

  // Get Shopify API client for the shop
  const shopify = await connections.shopify.forShopId(shopId);

  // If shopifyProductId is not provided, check if product exists or create it
  if (!shopifyProductId) {
    logger.info("No shopifyProductId provided, checking for existing product by handle");

    // Query for product by handle
    const handleResult = await shopify.graphql(
      `query($handle: String!) {
        productByHandle(handle: $handle) {
          id
          variants(first: 1) {
            edges {
              node {
                id
              }
            }
          }
        }
      }`,
      { handle: "shipping-insurance" }
    );

    if (handleResult.productByHandle) {
      // Product exists, extract ID
      const existingProductGid = handleResult.productByHandle.id;
      shopifyProductId = existingProductGid.split("/").pop();
      logger.info({ event: "insurance_product_found" }, "Found existing product by handle");
    } else {
      // Product doesn't exist, create it
      logger.info("Product not found, creating new insurance product");

      const createProductMutation = `
        mutation createProduct($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id
              variants(first: 1) {
                edges {
                  node {
                    id
                  }
                }
              }
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const productInput = {
        title: "Shipping Insurance",
        handle: "shipping-insurance",
        productType: "Service",
        vendor: "Enshield",
        status: "ACTIVE",
        tags: ["insurance", "enshield"]
      };

      const createResult = await shopify.graphql(createProductMutation, { input: productInput });

      if (createResult.productCreate.userErrors && createResult.productCreate.userErrors.length > 0) {
        logger.error({ event: "insurance_product_create_rejected" }, "Failed to create product");
        throw new Error("Shopify rejected insurance product creation");
      }

      const createdProduct = createResult.productCreate.product;
      const createdProductGid = createdProduct.id;
      shopifyProductId = createdProductGid.split("/").pop();

      logger.info({ event: "insurance_product_created" }, "Created new product");

      // Update variant price to $0.01
      if (createdProduct.variants.edges.length > 0) {
        const variantGid = createdProduct.variants.edges[0].node.id;
        logger.info({ event: "insurance_variant_update_started" }, "Updating insurance variant");

        const updateVariantMutation = `
          mutation productVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
            productVariantsBulkUpdate(productId: $productId, variants: $variants) {
              productVariants {
                id
                price
              }
              userErrors {
                field
                message
              }
            }
          }
        `;

        const updateResult = await shopify.graphql(updateVariantMutation, {
          productId: createdProductGid,
          variants: [
            {
              id: variantGid,
              price: "0.01"
            }
          ]
        });

        if (updateResult.productVariantsBulkUpdate.userErrors && updateResult.productVariantsBulkUpdate.userErrors.length > 0) {
          logger.error({ event: "insurance_variant_update_rejected" }, "Failed to update insurance variant");
          throw new Error("Shopify rejected insurance variant update");
        }

        logger.info({ event: "insurance_variant_updated" }, "Updated insurance variant");
      }
    }
  }

  // Construct the product GID
  const productGid = `gid://shopify/Product/${shopifyProductId}`;

  logger.info({ event: "insurance_product_query_started" }, "Querying Shopify for insurance product");

  // Query Shopify for the product and variant
  const result = await shopify.graphql(
    `query($id: ID!) {
      product(id: $id) {
        id
        variants(first: 1) {
          edges {
            node {
              id
            }
          }
        }
      }
    }`,
    { id: productGid }
  );

  // Check if product exists
  if (!result.product) {
    throw new Error("Insurance product not found in Shopify");
  }

  // Check if variant exists
  if (!result.product.variants.edges.length) {
    throw new Error("No variants found for insurance product");
  }

  const variantGid = result.product.variants.edges[0].node.id;

  // Extract numeric IDs from GIDs
  const productId = productGid.split("/").pop();
  const variantId = variantGid.split("/").pop();

  logger.info({ event: "insurance_product_identifiers_resolved" }, "Resolved insurance product identifiers");

  // Check if record already exists
  let existingRecord;
  try {
    existingRecord = await api.shippingInsuranceProduct.findFirst({
      filter: {
        shopId: { equals: shopId },
      },
    });
    logger.info({ event: "insurance_product_record_found" }, "Found existing insurance product record");
  } catch (error) {
    logger.info("No existing insurance product record found");
  }

  let record;
  if (existingRecord) {
    // Update existing record
    logger.info({ event: "insurance_product_record_update_started" }, "Updating insurance product record");
    record = await api.shippingInsuranceProduct.update(existingRecord.id, {
      productId,
      variantId,
      productGid,
      variantGid,
    });
    logger.info({ event: "insurance_product_record_updated" }, "Updated insurance product record");
  } else {
    // Create new record
    logger.info("Creating new insurance product record");
    record = await api.shippingInsuranceProduct.create({
      productId,
      variantId,
      productGid,
      variantGid,
      shop: {
        _link: shopId,
      },
    });
    logger.info({ event: "insurance_product_record_created" }, "Created insurance product record");
  }

  return record;
};

/** @type { ActionOptions } */
export const options = {
  returnType: "record",
};

export const params = {
  shopId: { type: "string" },
  shopifyProductId: { type: "string" },
};
