import { RouteHandler } from "gadget-server";

/**
 * Route handler to fetch shipping insurance metafields from Shopify
 * @type {RouteHandler<{ Querystring: { shopId: string } }>}
 */
const route = async ({ request, reply, api, logger, connections }) => {
  try {
    // Validate shopId query parameter
    const { shopId } = request.query;
    
    if (!shopId) {
      logger.warn("Missing shopId query parameter");
      await reply.code(400).send({
        success: false,
        error: "shopId query parameter is required"
      });
      return;
    }

    logger.info({ shopId }, "Fetching metafields for shop");

    // Find the shop in Gadget database
    const shop = await api.shopifyShop.findOne(shopId, {
      select: {
        id: true,
        domain: true
      }
    });

    if (!shop) {
      logger.warn({ shopId }, "Shop not found in database");
      await reply.code(404).send({
        success: false,
        error: "Shop not found"
      });
      return;
    }

    logger.info({ shopId, domain: shop.domain }, "Shop found, fetching metafields from Shopify");

    // Query Shopify GraphQL API for metafields
    const query = `
      query getShopMetafields {
        shop {
          metafields(first: 10, namespace: "enshield") {
            edges {
              node {
                id
                namespace
                key
                value
              }
            }
          }
        }
      }
    `;

    // Make GraphQL request to Shopify
    const shopifyClient = await connections.shopify.forShopId(shopId);
    const shopifyResponse = await shopifyClient.graphql(query);

    logger.info({ shopId }, "Received response from Shopify");

    // Parse the response and extract metafield values
    const metafields = shopifyResponse.shop?.metafields?.edges || [];
    
    let learnMoreUrl = "";
    let desktopImageUrl = "";
    let mobileImageUrl = "";

    for (const edge of metafields) {
      const node = edge.node;
      if (node.key === "learn_more_url") {
        learnMoreUrl = node.value || "";
      } else if (node.key === "desktop_image_url") {
        desktopImageUrl = node.value || "";
      } else if (node.key === "mobile_image_url") {
        mobileImageUrl = node.value || "";
      }
    }

    logger.info({ 
      shopId, 
      learnMoreUrl, 
      desktopImageUrl, 
      mobileImageUrl 
    }, "Successfully fetched and parsed metafields");

    // Return success response
    await reply.send({
      success: true,
      learnMoreUrl,
      desktopImageUrl,
      mobileImageUrl
    });

  } catch (error) {
    logger.error({ error, shopId: request.query.shopId }, "Error fetching metafields");
    
    // Handle specific error cases
    if (error.message && error.message.includes("not found")) {
      await reply.code(404).send({
        success: false,
        error: "Shop not found"
      });
    } else {
      await reply.code(500).send({
        success: false,
        error: "Internal server error while fetching metafields"
      });
    }
  }
};

// Set route options including CORS
route.options = {
  cors: {
    origin: true
  }
};

export default route;