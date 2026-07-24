import {
  PERMISSIONS,
  requireShopPermission,
} from "../../lib/permissions.js";

/**
 * Route handler to fetch shipping insurance metafields from Shopify
 * @type {RouteHandler<{ Querystring: { shopId: string } }>}
 */
const route = async ({
  request,
  reply,
  api,
  logger,
  connections,
  session,
}) => {
  try {
    const shopId = await requireShopPermission(
      { api, session },
      PERMISSIONS.VIEW_STOREFRONT_CONFIGURATION,
      request.query.shopId
    );

    logger.info({ shopId }, "Fetching metafields for shop");

    // Find the shop in Gadget database
    const shop = await api.shopifyShop.findFirst({
      filter: { id: { equals: shopId } },
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

    logger.info({ shopId }, "Shop found, fetching metafields from Shopify");

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

    logger.info({ shopId }, "Successfully fetched and parsed metafields");

    // Return success response
    await reply.send({
      success: true,
      learnMoreUrl,
      desktopImageUrl,
      mobileImageUrl
    });

  } catch (error) {
    logger.error(
      { errorName: error?.name, statusCode: error?.statusCode },
      "Error fetching metafields"
    );
    
    // Handle specific error cases
    if ([401, 403].includes(error.statusCode)) {
      await reply.code(error.statusCode).send({
        success: false,
        error: error.message,
      });
    } else if (error.message && error.message.includes("not found")) {
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
