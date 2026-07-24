import {
  PERMISSIONS,
  requireShopPermission,
} from "../../lib/permissions.js";

/**
 * Route handler for the Shop Info / Settings page.
 *
 * WHY THIS EXISTS:
 * The Shop Info page (web/routes/index.jsx) previously resolved the shop via a
 * client-side `useFindFirst(api.shopifyShop)`. That is an authenticated model
 * read that THROWS GGT_PERMISSION_DENIED when the page is opened without a live
 * Shopify session (e.g. hitting the route directly, or before the embedded
 * session is established). The working dashboard route avoids this by resolving
 * the shop server-side from $session and returning plain JSON.
 *
 * This route resolves the current shop from the authenticated session and
 * applies that ID explicitly to the superuser query, then fetches only that
 * shop's Enshield metafields from Shopify.
 *
 * Returns:
 *   - shop:            { id, domain, myshopifyDomain }
 *   - learnMoreUrl / desktopImageUrl / mobileImageUrl: current metafield values
 *
 * @type {RouteHandler}
 */
const route = async ({ reply, api, logger, connections, session }) => {
  try {
    const shopId = await requireShopPermission(
      { api, session },
      PERMISSIONS.VIEW_STOREFRONT_CONFIGURATION
    );
    // No shopId is accepted from the client; the session is the source of truth.
    const shop = await api.shopifyShop.findFirst({
      filter: { id: { equals: shopId } },
      select: {
        id: true,
        domain: true,
        myshopifyDomain: true,
      },
    });

    if (!shop) {
      await reply.code(404).send({
        success: false,
        error: "Shop not found for this session",
      });
      return;
    }

    // Fetch this shop's Enshield metafields from Shopify (server-side).
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

    let learnMoreUrl = "";
    let desktopImageUrl = "";
    let mobileImageUrl = "";

    try {
      const shopifyClient = await connections.shopify.forShopId(shopId);
      const shopifyResponse = await shopifyClient.graphql(query);
      const metafields = shopifyResponse.shop?.metafields?.edges || [];

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
    } catch (mfError) {
      // Metafields are non-critical for rendering the page — log and continue
      // with empty defaults rather than failing the whole page.
      logger.error(
        { errorName: mfError?.name, statusCode: mfError?.statusCode },
        "Error fetching metafields for shop-info; returning empty defaults"
      );
    }

    await reply.send({
      success: true,
      shop: {
        id: shop.id,
        domain: shop.domain,
        myshopifyDomain: shop.myshopifyDomain,
      },
      learnMoreUrl,
      desktopImageUrl,
      mobileImageUrl,
    });
  } catch (error) {
    logger.error(
      { errorName: error?.name, statusCode: error?.statusCode },
      "Error in shop-info route"
    );
    const statusCode = [401, 403].includes(error.statusCode)
      ? error.statusCode
      : 500;
    await reply.code(statusCode).send({
      success: false,
      error:
        statusCode === 500
          ? "Internal server error while loading shop info"
          : error.message,
    });
  }
};

route.options = {
  cors: {
    origin: true,
  },
};

export default route;
