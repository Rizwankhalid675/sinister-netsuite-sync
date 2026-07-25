/** @type { ActionRun } */
export const run = async ({ params, logger, api, connections }) => {
  const { shopId } = params;
  
  logger.info({ shopId }, "Starting insurance product sync");
  
  // Find products with 'Shipping Insurance' in the title for this shop
  const products = await api.shopifyProduct.findMany({
    filter: {
      shopId: { equals: shopId },
    },
    search: "Shipping Insurance",
    first: 1,
  });
  
  if (products.length === 0) {
    logger.warn({ shopId }, "No insurance products found for shop");
    return { message: "No insurance products found" };
  }
  
  const product = products[0];
  logger.info({ productId: product.id, shopId }, "Found insurance product");
  
  // Get the first variant for this product
  const variant = await api.shopifyProductVariant.findFirst({
    filter: {
      productId: { equals: product.id },
      shopId: { equals: shopId },
    },
  });
  
  if (!variant) {
    logger.warn({ productId: product.id, shopId }, "No variant found for insurance product");
    return { message: "No variant found for insurance product" };
  }
  
  logger.info({ variantId: variant.id, productId: product.id, shopId }, "Found insurance product variant");
  
  // Check if shippingInsuranceProduct already exists for this shop
  const existingInsuranceProduct = await api.shippingInsuranceProduct.maybeFindFirst({
    filter: {
      shopId: { equals: shopId },
    },
  });
  
  if (existingInsuranceProduct) {
    // Update existing record
    logger.info({ id: existingInsuranceProduct.id, shopId }, "Updating existing insurance product record");
    await api.shippingInsuranceProduct.update(existingInsuranceProduct.id, {
      productId: product.id,
      variantId: variant.id,
      productGid: `gid://shopify/Product/${product.id}`,
      variantGid: `gid://shopify/ProductVariant/${variant.id}`,
    });
  } else {
    // Create new record
    logger.info({ shopId }, "Creating new insurance product record");
    await api.shippingInsuranceProduct.create({
      productId: product.id,
      variantId: variant.id,
      productGid: `gid://shopify/Product/${product.id}`,
      variantGid: `gid://shopify/ProductVariant/${variant.id}`,
      shop: {
        _link: shopId,
      },
    });
  }
  
  logger.info({ productId: product.id, variantId: variant.id, shopId }, "Successfully synced insurance product");
  
  return {
    success: true,
    message: "Insurance product synced successfully",
    productId: product.id,
    variantId: variant.id,
  };
};

/** @type { ActionOptions } */
export const params = {
  shopId: { type: "string" },
};
