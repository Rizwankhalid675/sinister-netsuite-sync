import { ActionOptions } from "gadget-server";

/** @type { ActionRun } */
export const run = async ({ params, logger, api, connections }) => {
  let { shopId, shopifyProductId } = params;

  logger.info({ shopId, shopifyProductId }, "Setting up insurance product");

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
      logger.info({ shopifyProductId, existingProductGid }, "Found existing product by handle");
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
        logger.error({ errors: createResult.productCreate.userErrors }, "Failed to create product");
        throw new Error(`Failed to create product: ${JSON.stringify(createResult.productCreate.userErrors)}`);
      }

      const createdProduct = createResult.productCreate.product;
      const createdProductGid = createdProduct.id;
      shopifyProductId = createdProductGid.split("/").pop();

      logger.info({ shopifyProductId, createdProductGid }, "Created new product");

      // Update variant price to $0.01
      if (createdProduct.variants.edges.length > 0) {
        const variantGid = createdProduct.variants.edges[0].node.id;
        logger.info({ variantGid }, "Updating variant price to $0.01");

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
          logger.error({ errors: updateResult.productVariantsBulkUpdate.userErrors }, "Failed to update variant price");
          throw new Error(`Failed to update variant price: ${JSON.stringify(updateResult.productVariantsBulkUpdate.userErrors)}`);
        }

        logger.info({ variantGid }, "Updated variant price successfully");
      }
    }
  }

  // Construct the product GID
  const productGid = `gid://shopify/Product/${shopifyProductId}`;

  logger.info({ productGid }, "Querying Shopify for product");

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
    throw new Error(`Product not found in Shopify: ${productGid}`);
  }

  // Check if variant exists
  if (!result.product.variants.edges.length) {
    throw new Error(`No variants found for product: ${productGid}`);
  }

  const variantGid = result.product.variants.edges[0].node.id;

  // Extract numeric IDs from GIDs
  const productId = productGid.split("/").pop();
  const variantId = variantGid.split("/").pop();

  logger.info({ productId, variantId, productGid, variantGid }, "Extracted product and variant IDs");

  // Check if record already exists
  let existingRecord;
  try {
    existingRecord = await api.shippingInsuranceProduct.findFirst({
      filter: {
        shopId: { equals: shopId },
      },
    });
    logger.info({ existingRecordId: existingRecord.id }, "Found existing insurance product record");
  } catch (error) {
    logger.info("No existing insurance product record found");
  }

  let record;
  if (existingRecord) {
    // Update existing record
    logger.info({ recordId: existingRecord.id }, "Updating existing insurance product record");
    record = await api.shippingInsuranceProduct.update(existingRecord.id, {
      productId,
      variantId,
      productGid,
      variantGid,
    });
    logger.info({ recordId: record.id }, "Updated insurance product record");
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
    logger.info({ recordId: record.id }, "Created insurance product record");
  }

  return record;
};

/** @type { ActionOptions } */
export const options = {
  returnType: true,
};

export const params = {
  shopId: { type: "string" },
  shopifyProductId: { type: "string" },
};
