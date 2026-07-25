const route = async ({ request, reply, logger, api, connections }) => {
  try {
    const { cartTotal, shopDomain } = request.body;

    if (typeof cartTotal !== 'number' || !shopDomain) {
      await reply.code(400).send({ error: 'Invalid input' });
      return;
    }

    logger.info({ cartTotal, shopDomain }, 'Received request to get insurance variant');

    // Find shop
    const shop = await api.shopifyShop.findFirst({
      filter: {
        OR: [
          { myshopifyDomain: { equals: shopDomain } },
          { domain: { equals: shopDomain } }
        ]
      },
      select: { id: true }
    });

    if (!shop) {
      await reply.code(404).send({ error: 'Shop not found' });
      return;
    }

    logger.info({ shopId: shop.id }, 'Found shop');

    // Call Enshield validate API to get base_percentage and base_amount
    const enshieldApiKey = process.env.ENSHIELD_API_KEY;
    if (!enshieldApiKey) {
      await reply.code(500).send({ error: 'ENSHIELD_API_KEY not configured' });
      return;
    }

    let basePercentage = 0;
    let baseAmount = 0;

    try {
      const validateUrl = `https://manage.enshield.com/api/auth`;
      logger.info({ validateUrl, cartTotal }, 'Calling Enshield validate API');

      const validateResponse = await fetch(validateUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Api-Key': enshieldApiKey
        },
        body: JSON.stringify({
          order_value: cartTotal.toFixed(2)
        })
      });

      if (!validateResponse.ok) {
        const errorText = await validateResponse.text();
        logger.error({ status: validateResponse.status, error: errorText }, 'Enshield validate API error');
        await reply.code(500).send({ error: 'Failed to validate with Enshield' });
        return;
      }

      const validateData = await validateResponse.json();
      logger.info({ validateData }, 'Received response from Enshield validate API');

      basePercentage = parseFloat(validateData.base_percentage || 0);
      baseAmount = parseFloat(validateData.base_amount || 0);

      logger.info({ basePercentage, baseAmount }, 'Extracted base_percentage and base_amount from Enshield');
    } catch (error) {
      logger.error({ error: error.message }, 'Failed to call Enshield validate API');
      await reply.code(500).send({ error: 'Failed to validate with Enshield' });
      return;
    }

    // Calculate insurance cost: (cartTotal * base_percentage / 100) + base_amount
    const percentageCost = cartTotal * (basePercentage / 100);
    const insuranceCost = percentageCost + baseAmount;

    // If cart is empty, don't add insurance
    if (cartTotal === 0) {
      logger.info({ cartTotal, insuranceCost }, 'Cart is empty, not adding insurance');
      await reply.send({
        variantId: null,
        insuranceCost: 0,
        displayPrice: '0.00',
        shouldAdd: false
      });
      return;
    }

    // Get insurance product
    const product = await api.shippingInsuranceProduct.findFirst({
      filter: { shopId: { equals: shop.id } },
      select: { productId: true, productGid: true, variantId: true }
    });

    if (!product || !product.variantId) {
      await reply.code(404).send({ error: 'Insurance product not found' });
      return;
    }

    logger.info({ productId: product.productId, productGid: product.productGid }, 'Found insurance product');

    // Get Shopify API client
    const shopify = await connections.shopify.forShopId(shop.id);
    const productGid = product.productGid || `gid://shopify/Product/${product.productId}`;

    // Fetch ALL variants (paginate if needed)
    let allVariants = [];
    let hasNextPage = true;
    let cursor = null;

    while (hasNextPage && allVariants.length < 2500) {
      const variantsQuery = await shopify.graphql(
        `query($id: ID!, $cursor: String) {
          product(id: $id) {
            variants(first: 250, after: $cursor) {
              pageInfo {
                hasNextPage
                endCursor
              }
              edges {
                node {
                  id
                  legacyResourceId
                  price
                }
              }
            }
          }
        }`,
        { id: productGid, cursor }
      );

      const variants = variantsQuery.product?.variants?.edges || [];
      allVariants = allVariants.concat(variants);
      hasNextPage = variantsQuery.product?.variants?.pageInfo?.hasNextPage || false;
      cursor = variantsQuery.product?.variants?.pageInfo?.endCursor;
    }

    logger.info({ totalVariants: allVariants.length, cartTotal }, 'Fetched all variants');



    // Apply minimum insurance cost of $1.00
    const finalInsuranceCost = Math.max(insuranceCost, 1.00);
    const minimumApplied = finalInsuranceCost > insuranceCost;

    if (minimumApplied) {
      logger.info({
        calculatedCost: insuranceCost.toFixed(2),
        finalCost: finalInsuranceCost.toFixed(2)
      }, 'Applied minimum $1.00 insurance cost');
    }

    const roundedPrice = Math.round(finalInsuranceCost);
    const priceInDollars = roundedPrice.toFixed(2);

    logger.info({
      cartTotal,
      basePercentage,
      baseAmount,
      percentageCost: percentageCost.toFixed(2),
      insuranceCost: insuranceCost.toFixed(2),
      finalInsuranceCost: finalInsuranceCost.toFixed(2),
      roundedPrice,
      priceInDollars,
      minimumApplied
    }, 'Calculated insurance cost with Enshield formula');

    // Try to find exact match
    let matchingVariant = allVariants.find(
      edge => edge.node.price === priceInDollars
    );

    // If no exact match, find closest variant
    if (!matchingVariant && allVariants.length > 0) {
      const targetPrice = parseFloat(priceInDollars);
      let closestVariant = null;
      let smallestDiff = Infinity;

      for (const edge of allVariants) {
        const variantPrice = parseFloat(edge.node.price);
        const diff = Math.abs(variantPrice - targetPrice);

        if (diff < smallestDiff) {
          smallestDiff = diff;
          closestVariant = edge;
        }
      }

      matchingVariant = closestVariant;
      logger.info({
        requestedPrice: priceInDollars,
        closestPrice: closestVariant?.node.price,
        diff: smallestDiff
      }, 'Using closest variant');
    }

    if (matchingVariant) {
      logger.info({
        variantId: matchingVariant.node.legacyResourceId,
        price: matchingVariant.node.price,
        requestedPrice: priceInDollars
      }, 'Found matching/closest variant');

      await reply.send({
        variantId: matchingVariant.node.legacyResourceId,
        insuranceCost: parseFloat(finalInsuranceCost.toFixed(2)),
        displayPrice: matchingVariant.node.price
      });
      return;
    }

    // Fallback to $0 variant if nothing found
    const fallbackVariant = allVariants.find(
      edge => edge.node.price === '0.00' || edge.node.price === '0.01'
    ) || allVariants[0];

    if (fallbackVariant) {
      logger.warn({ calculatedPrice: priceInDollars, totalVariants: allVariants.length }, 'No matching variant found, using fallback');
      await reply.send({
        variantId: fallbackVariant.node.legacyResourceId,
        insuranceCost: parseFloat(finalInsuranceCost.toFixed(2)),
        displayPrice: fallbackVariant.node.price,
        note: 'Using fallback variant - actual price applied at checkout'
      });
      return;
    }

    // No variants found at all
    await reply.code(404).send({ error: 'No insurance variants found' });
  } catch (error) {
    logger.error({
      error: error.message,
      stack: error.stack,
      body: request.body
    }, 'Error creating insurance variant');
    await reply.code(500).send({ error: 'Internal server error', details: error.message });
  }
};

route.options = {
  cors: {
    origin: true,
    methods: ['POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true
  },
  schema: {
    body: {
      type: 'object',
      properties: {
        cartTotal: { type: 'number' },
        shopDomain: { type: 'string' }
      },
      required: ['cartTotal', 'shopDomain']
    }
  }
};

export default route;