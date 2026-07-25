/**
 * Helper function to extract numeric ID from Shopify GID
 * @param {string} gid - Shopify GID format like 'gid://shopify/Product/12345678'
 * @returns {string} - Numeric ID like '12345678'
 */
const extractNumericId = (gid) => {
  if (!gid) return null;
  const parts = gid.split('/');
  return parts[parts.length - 1];
};

/** @type { ActionRun } */
export const run = async ({ params, logger, api, connections }) => {
  const { shopId } = params;

  logger.info({ shopId }, "Starting shipping insurance product creation");

  try {
    // Fetch the shop record
    const shop = await api.shopifyShop.findOne(shopId, {
      select: { id: true }
    });

    if (!shop) {
      throw new Error(`Shop with ID ${shopId} not found`);
    }

    logger.info({ shopId }, "Found shop");

    // Get Shopify API client for this shop
    const shopify = await connections.shopify.forShopId(shopId);

    // Check if product already exists with handle 'shipping-insurance'
    const existingProductQuery = `
      query {
        productByHandle(handle: "shipping-insurance") {
          id
          title
          variants(first: 1) {
            edges {
              node {
                id
              }
            }
          }
        }
      }
    `;

    const existingProductResult = await shopify.graphql(existingProductQuery);

    let productGid, variantGid, productId, variantId;

    if (existingProductResult.productByHandle) {
      const product = existingProductResult.productByHandle;
      productGid = product.id;
      variantGid = product.variants.edges[0]?.node.id;
      productId = extractNumericId(productGid);
      variantId = extractNumericId(variantGid);

      logger.info({
        productGid,
        productId,
        variantGid,
        variantId
      }, "Shipping insurance product already exists");
    } else {
      // Product doesn't exist, create it via REST API
      logger.info("Creating new shipping insurance product via REST API");

      const productData = {
        product: {
          title: "Enshield Shipping Insurance",
          handle: "shipping-insurance",
          product_type: "Service",
          vendor: "Enshield",
          status: "unlisted",
          published: true,
          published_scope: "web",
          tags: "insurance,enshield",
          options: [
            {
              name: "Amount",
              values: ["Standard"]
            }
          ],
          variants: [
            {
              option1: "Standard",
              price: "0.01",
              taxable: false,
              inventory_policy: "continue",
              inventory_management: null
            }
          ]
        }
      };

      logger.info({ productData }, "Sending REST API request to create product");

      const result = await shopify.product.create(productData.product);

      logger.info({ result }, "Received response from Shopify REST API");

      if (!result) {
        logger.error({ result }, "Unexpected response format from Shopify REST API");
        throw new Error("Product creation response missing product data");
      }

      // Extract IDs directly from REST API response (already numeric)
      productId = result.id.toString();
      variantId = result.variants[0]?.id.toString();

      // Construct GIDs from numeric IDs
      productGid = `gid://shopify/Product/${productId}`;
      variantGid = `gid://shopify/ProductVariant/${variantId}`;

      logger.info({
        productGid,
        productId,
        variantGid,
        variantId,
        product: result
      }, "Successfully created shipping insurance product via REST API");

      // Hide product from recommendations and feeds
      const hideProductMutation = `
        mutation updateProduct($input: ProductInput!) {
          productUpdate(input: $input) {
            product {
              id
            }
            userErrors {
              field
              message
            }
          }
        }
      `;

      const hideProductVariables = {
        input: {
          id: productGid,
          seo: {
            title: "Shipping Insurance - Internal Use Only",
            description: "This product is for internal use only and should not appear in search results or recommendations."
          },
          metafields: [
            {
              namespace: "enshield",
              key: "exclude_from_recommendations",
              value: "true",
              type: "boolean"
            }
          ]
        }
      };

      await shopify.graphql(hideProductMutation, hideProductVariables);
      logger.info({ productGid }, "Updated product to exclude from recommendations and feeds");


    }

    // Check if shippingInsuranceProduct record already exists for this shop
    let existingRecord = null;
    try {
      existingRecord = await api.shippingInsuranceProduct.findFirst({
        filter: {
          shopId: { equals: shopId }
        }
      });
    } catch (error) {
      // No existing record found, which is fine
      logger.info({ shopId }, "No existing shippingInsuranceProduct record found");
    }

    let savedRecord;
    if (existingRecord) {
      // Update existing record
      logger.info({ recordId: existingRecord.id }, "Updating existing shippingInsuranceProduct record");
      savedRecord = await api.shippingInsuranceProduct.update(existingRecord.id, {
        productId,
        variantId,
        productGid,
        variantGid
      });
    } else {
      // Create new record
      logger.info("Creating new shippingInsuranceProduct record");
      savedRecord = await api.shippingInsuranceProduct.create({
        productId,
        variantId,
        productGid,
        variantGid,
        shop: { _link: shopId }
      });
    }

    logger.info({
      recordId: savedRecord.id,
      productGid,
      productId,
      variantGid,
      variantId
    }, "Successfully stored shipping insurance product");

    // Enqueue product sync to import into Gadget's database
    await api.enqueue(api.syncInsuranceProduct, { shopId });
    logger.info({ shopId }, "Enqueued syncInsuranceProduct action to sync product into Gadget database");

    // Enqueue variant creation if this is a newly created product
    let variantsEnqueued = false;
    if (!existingProductResult.productByHandle) {
      await api.enqueue(api.createInsuranceVariants, { shopId });
      logger.info({ shopId }, "Enqueued createInsuranceVariants action to create price tier variants");
      variantsEnqueued = true;
    }

    return {
      productGid,
      productId,
      variantGid,
      variantId,
      recordId: savedRecord.id,
      existed: !!existingProductResult.productByHandle,
      variantsEnqueued,
      syncEnqueued: true
    };

  } catch (error) {
    logger.error({ error, shopId }, "Failed to create shipping insurance product");
    throw error;
  }
};

/** @type { ActionOptions } */
export const options = {
  triggers: {
    api: true
  }
};

export const params = {
  shopId: {
    type: "string"
  }
};
