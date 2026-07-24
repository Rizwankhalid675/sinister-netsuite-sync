import {
  calculateProtectionPrice,
  formatMinorAmount,
  selectProtectionPricing,
  majorToMinor,
  selectExactVariant,
} from "../../lib/protection.js";

const route = async ({ request, reply, logger, api, connections }) => {
  try {
    const shopifyContext = connections?.shopify;
    const verifiedShopId = shopifyContext?.currentShopId;
    const verifiedShopDomain = shopifyContext?.currentShopDomain;
    if (!shopifyContext?.currentAppProxy || !verifiedShopId || !verifiedShopDomain) {
      await reply.code(401).send({ error: "Authenticated Shopify context required" });
      return;
    }

    const { cartTotal, shopDomain, currency = "USD" } = request.body || {};

    if (typeof shopDomain !== "string") {
      await reply.code(400).send({ error: 'Invalid input' });
      return;
    }
    if (shopDomain.toLowerCase() !== String(verifiedShopDomain).toLowerCase()) {
      await reply.code(403).send({ error: "Shopify tenant mismatch" });
      return;
    }
    if (typeof cartTotal !== "number" || !Number.isFinite(cartTotal) || cartTotal < 0) {
      await reply.code(400).send({ error: "Invalid input" });
      return;
    }

    logger.info({ event: "protection_variant_requested" }, "Received protection variant request");

    // The Gadget-verified app-proxy context is the tenant authority. Never use
    // the client-supplied domain to select a shop.
    const shop = await api.shopifyShop.findFirst({
      filter: { id: { equals: verifiedShopId } },
      select: { id: true, currency: true }
    });

    if (!shop) {
      await reply.code(404).send({ error: 'Shop not found' });
      return;
    }

    logger.info({ event: "protection_shop_resolved" }, "Protection shop resolved");

    // Get insurance settings - we need the API endpoint
    const settings = await api.shippingInsuranceSetting.findMany({
      filter: {
        shopId: { equals: shop.id },
        status: { equals: 'active' }
      },
      select: {
        basePercentage: true,
        baseAmount: true,
        currency: true,
        pricingVersion: true,
        effectiveAt: true,
      },
      first: 250,
    });

    if (!settings.length) {
      await reply.code(404).send({ error: 'Insurance not configured' });
      return;
    }
    if (settings.hasNextPage) {
      await reply.code(503).send({ error: "Protection pricing set is too large to select safely" });
      return;
    }

    const pricing = selectProtectionPricing(settings);
    if (
      String(currency).toUpperCase() !== pricing.currency
      || String(shop.currency ?? "").toUpperCase() !== pricing.currency
    ) {
      await reply.code(400).send({ error: "Currency does not match configured protection pricing" });
      return;
    }

    const priced = calculateProtectionPrice({
      orderAmountMinor: majorToMinor(String(cartTotal), currency),
      percentage: pricing.percentage,
      baseAmount: pricing.baseAmount,
      currency: pricing.currency,
    });
    const priceInDollars = formatMinorAmount(priced.amountMinor, priced.minorUnit);
    const insuranceCost = priced.amountMinor / (10 ** priced.minorUnit);

    logger.info({ event: "protection_price_calculated" }, "Calculated protection price");

    // Get insurance product
    const product = await api.shippingInsuranceProduct.findFirst({
      filter: { shopId: { equals: shop.id } },
      select: { productId: true, productGid: true, variantId: true }
    });

    if (!product || !product.variantId) {
      await reply.code(404).send({ error: 'Insurance product not found' });
      return;
    }

    logger.info({ event: "protection_product_resolved" }, "Protection product resolved");

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
    if (hasNextPage) {
      await reply.code(503).send({ error: "Protection variant list was truncated" });
      return;
    }

    logger.info({ event: "protection_variants_fetched" }, "Fetched protection variants");

    // Try to find exact match
    const matchingVariant = selectExactVariant(
      allVariants.map((edge) => ({
        ...edge,
        node: { ...edge.node, currencyCode: pricing.currency },
      })),
      priced.amountMinor,
      pricing.currency
    );

    if (matchingVariant) {
      logger.info({ event: "protection_variant_matched" }, "Found exact protection variant");

      await reply.send({
        variantId: matchingVariant.node.legacyResourceId,
        insuranceCost,
        insuranceCostMinor: priced.amountMinor,
        currency: priced.currency,
        displayPrice: matchingVariant.node.price
      });
      return;
    }

    await reply.code(409).send({
      error: "Exact protection price variant is unavailable",
      amountMinor: priced.amountMinor,
      currency: priced.currency,
    });
  } catch (error) {
    logger.error({ errorName: error?.name }, "Protection variant request failed");
    await reply.code(500).send({ error: "Internal server error" });
  }
};

route.options = {
  cors: { origin: true },
  schema: {
    body: {
      type: 'object',
      properties: {
        cartTotal: { type: 'number' },
        shopDomain: { type: 'string' },
        currency: { type: 'string', minLength: 3, maxLength: 3 }
      },
      required: ['cartTotal', 'shopDomain']
    }
  }
};

export default route;
