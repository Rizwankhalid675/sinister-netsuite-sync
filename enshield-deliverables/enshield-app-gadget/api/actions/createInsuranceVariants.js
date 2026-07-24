/** @type { ActionRun } */
export const run = async ({ params, logger, api, connections }) => {
  const { shopId } = params;

  if (!shopId) {
    throw new Error('shopId parameter is required');
  }

  logger.info({ shopId }, 'Starting insurance variant creation');

  // Find the insurance product for this shop
  const product = await api.shippingInsuranceProduct.findFirst({
    filter: { shopId: { equals: shopId } },
    select: { productId: true, productGid: true, variantId: true }
  });

  if (!product) {
    throw new Error('Insurance product not found for shop');
  }

  logger.info({ productId: product.productId }, 'Found insurance product');

  const shopify = await connections.shopify.forShopId(shopId);
  const productGid = product.productGid || `gid://shopify/Product/${product.productId}`;

  // Check existing variants
  const existingVariantsQuery = await shopify.graphql(
    `query($id: ID!) {
      product(id: $id) {
        variants(first: 250) {
          edges {
            node {
              id
              price
            }
          }
        }
      }
    }`,
    { id: productGid }
  );

  const existingVariants = existingVariantsQuery.product?.variants?.edges || [];
  const existingPrices = new Set(existingVariants.map(edge => parseFloat(edge.node.price)));

  logger.info({ existingCount: existingVariants.length }, 'Found existing variants');

  // Generate price tiers
  const pricesToCreate = [];

  // $0 to $200: every $1
  for (let i = 0; i <= 200; i++) {
    if (!existingPrices.has(i)) {
      pricesToCreate.push(i.toFixed(2));
    }
  }

  // $205 to $500: every $5
  for (let i = 205; i <= 500; i += 5) {
    if (!existingPrices.has(i)) {
      pricesToCreate.push(i.toFixed(2));
    }
  }

  // $510 to $1000: every $10
  for (let i = 510; i <= 1000; i += 10) {
    if (!existingPrices.has(i)) {
      pricesToCreate.push(i.toFixed(2));
    }
  }

  // $1020 to $2000: every $20
  for (let i = 1020; i <= 2000; i += 20) {
    if (!existingPrices.has(i)) {
      pricesToCreate.push(i.toFixed(2));
    }
  }

  logger.info({ totalToCreate: pricesToCreate.length }, 'Will create new variants');

  if (pricesToCreate.length === 0) {
    return {
      success: true,
      message: 'All variants already exist',
      existingCount: existingVariants.length
    };
  }

  // Create variants in smaller batches
  const batchSize = 25;
  let createdCount = 0;
  const errors = [];

  for (let i = 0; i < pricesToCreate.length; i += batchSize) {
    const batch = pricesToCreate.slice(i, i + batchSize);

    const variantInputs = batch.map(price => ({
      price: price,
      inventoryPolicy: 'CONTINUE',
      taxable: false,
      optionValues: [
        {
          optionName: "Amount",
          name: "$" + price
        }
      ]
    }));

    const mutation = `
      mutation productVariantsBulkCreate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkCreate(productId: $productId, variants: $variants) {
          userErrors {
            field
            message
          }
          productVariants {
            id
            price
          }
        }
      }
    `;

    const variables = {
      productId: productGid,
      variants: variantInputs
    };

    try {
      const result = await shopify.graphql(mutation, variables);

      if (result.productVariantsBulkCreate?.userErrors?.length > 0) {
        const batchErrors = result.productVariantsBulkCreate.userErrors;
        logger.error({ errors: batchErrors, batchNumber: Math.floor(i / batchSize) }, 'Errors creating variant batch');
        errors.push(...batchErrors);

        // If we hit variant limit, stop trying
        if (batchErrors.some(e => e.message.includes('variant') && e.message.includes('limit'))) {
          logger.error('Hit Shopify variant limit, stopping creation');
          break;
        }
      } else {
        const variantsCreated = result.productVariantsBulkCreate?.productVariants?.length || 0;
        createdCount += variantsCreated;
        logger.info({ createdCount, batchNumber: Math.floor(i / batchSize), batchVariants: variantsCreated }, 'Created variant batch');
      }

      // Small delay between batches
      await new Promise(resolve => setTimeout(resolve, 300));
    } catch (error) {
      logger.error({ error: error.message, batchNumber: Math.floor(i / batchSize) }, 'Error creating variants batch');
      errors.push({ message: error.message, batch: Math.floor(i / batchSize) });
    }
  }

  return {
    success: errors.length === 0,
    message: errors.length === 0 ? 'All variants created successfully' : 'Some variants failed to create',
    totalCreated: createdCount,
    totalAttempted: pricesToCreate.length,
    existingCount: existingVariants.length,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined // Limit error output
  };
};

export const params = {
  shopId: { type: 'string' }
};
