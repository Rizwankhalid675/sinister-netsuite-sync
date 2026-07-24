import {
  authorizeActionShop,
  PERMISSIONS,
} from "../lib/permissions.js";

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

  logger.info({ event: "shipping_insurance_setup_started" }, "Starting shipping insurance product creation");

  try {
    // Fetch the shop record
    const shop = await api.shopifyShop.findOne(shopId, {
      select: { id: true, myshopifyDomain: true }
    });

    if (!shop) {
      throw new Error("Shop not found");
    }

    logger.info({ event: "shipping_insurance_shop_resolved" }, "Found shop");

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

      logger.info(
        { event: "shipping_insurance_product_found" },
        "Shipping insurance product already exists"
      );
    } else {
      // Product doesn't exist, create it
      logger.info("Creating new shipping insurance product");

      const createProductMutation = `
        mutation createProduct($input: ProductInput!) {
          productCreate(input: $input) {
            product {
              id
              title
              handle
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
        tags: ["insurance", "enshield"],
        productOptions: [
          {
            name: "Amount",
            values: [{ name: "Standard" }]
          }
        ],
        productPublications: [
          {
            publicationId: "gid://shopify/Publication/1",
            publishDate: null
          }
        ]
      };

      // Make direct GraphQL call to get IDs immediately
      const createResult = await shopify.graphql(createProductMutation, { input: productInput });

      if (createResult.productCreate.userErrors?.length > 0) {
        const errors = createResult.productCreate.userErrors;
        logger.error({ event: "shipping_insurance_product_create_rejected" }, "Failed to create product in Shopify");
        throw new Error("Shopify rejected shipping insurance product creation");
      }

      const product = createResult.productCreate.product;
      productGid = product.id;
      variantGid = product.variants.edges[0]?.node.id;
      productId = extractNumericId(productGid);
      variantId = extractNumericId(variantGid);

      logger.info(
        { event: "shipping_insurance_product_created" },
        "Created new shipping insurance product"
      );

      // Update the variant with correct price and settings
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

      const variantInput = {
        id: variantGid,
        price: "0.01",
        taxable: false,
        inventoryPolicy: "CONTINUE",
        quantityRule: {
          min: 1,
          max: 1,
          increment: 1
        }
      };

      logger.info({ event: "shipping_insurance_variant_update_started" }, "Updating variant settings");

      const updateResult = await shopify.graphql(updateVariantMutation, {
        productId: productGid,
        variants: [variantInput]
      });

      if (updateResult.productVariantsBulkUpdate.userErrors?.length > 0) {
        const errors = updateResult.productVariantsBulkUpdate.userErrors;
        logger.error({ event: "shipping_insurance_variant_update_rejected" }, "Failed to update product variant in Shopify");
        throw new Error("Shopify rejected shipping insurance variant update");
      }

      logger.info(
        { event: "shipping_insurance_variant_updated" },
        "Successfully updated variant settings"
      );
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
      logger.info(
        { event: "shipping_insurance_record_missing" },
        "No existing shippingInsuranceProduct record found"
      );
    }

    let savedRecord;
    if (existingRecord) {
      // Update existing record
      logger.info(
        { event: "shipping_insurance_record_update_started" },
        "Updating existing shippingInsuranceProduct record"
      );
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

    logger.info(
      { event: "shipping_insurance_record_stored" },
      "Successfully stored shipping insurance product"
    );

    return {
      productGid,
      productId,
      variantGid,
      variantId,
      recordId: savedRecord.id,
      existed: !!existingProductResult.productByHandle
    };

  } catch (error) {
    logger.error(
      { errorName: error?.name, statusCode: error?.statusCode },
      "Failed to create shipping insurance product"
    );
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
