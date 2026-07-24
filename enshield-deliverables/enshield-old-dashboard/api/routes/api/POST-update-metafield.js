import {
  PERMISSIONS,
  requireShopPermission,
} from "../../lib/permissions.js";

const route = async ({
  request,
  reply,
  api,
  logger,
  connections,
  session,
}) => {
  try {
    const {
      shopId: requestedShopId,
      learnMoreUrl,
      desktopImageUrl,
      mobileImageUrl,
    } = request.body;

    const shopId = await requireShopPermission(
      { api, session },
      PERMISSIONS.MANAGE_STOREFRONT_CONFIGURATION,
      requestedShopId
    );

    if (!learnMoreUrl) {
      await reply.code(400).send({
        success: false,
        error: "learnMoreUrl is required"
      });
      return;
    }

    // Find the shop by ID
    const shop = await api.shopifyShop.findFirst({
      filter: { id: { equals: shopId } },
      select: {
        id: true,
        name: true
      }
    });

    if (!shop) {
      await reply.code(404).send({
        success: false,
        error: "Shop not found"
      });
      return;
    }

    // Get the Shopify API client for this shop
    const shopify = await connections.shopify.forShopId(shopId);

    // Construct the proper GID format
    const shopGid = `gid://shopify/Shop/${shop.id}`;

    // Set up the GraphQL mutation
    const mutation = `
      mutation metafieldsSet($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `;

    // Build metafields array - only include fields that have values
    const metafields = [
      {
        ownerId: shopGid,
        namespace: "enshield",
        key: "learn_more_url",
        type: "url",
        value: learnMoreUrl
      }
    ];

    if (desktopImageUrl) {
      metafields.push({
        ownerId: shopGid,
        namespace: "enshield",
        key: "desktop_image_url",
        type: "url",
        value: desktopImageUrl
      });
    }

    if (mobileImageUrl) {
      metafields.push({
        ownerId: shopGid,
        namespace: "enshield",
        key: "mobile_image_url",
        type: "url",
        value: mobileImageUrl
      });
    }

    const variables = {
      metafields
    };

    logger.info({ shopId }, "Updating shop metafields");

    // Execute the GraphQL mutation using the shop-specific client
    const response = await shopify.graphql(mutation, variables);

    // Check for user errors from Shopify
    if (response.metafieldsSet?.userErrors?.length > 0) {
      logger.error(
        { shopId, outcome: "shopify_validation_failed" },
        "Shopify metafield update failed"
      );
      await reply.code(400).send({
        success: false,
        error: "Failed to update metafield",
        details: response.metafieldsSet.userErrors
      });
      return;
    }

    logger.info({ shopId }, "Successfully updated shop metafields");

    await reply.send({
      success: true,
      metafields: response.metafieldsSet?.metafields
    });
  } catch (error) {
    logger.error(
      { errorName: error?.name, statusCode: error?.statusCode },
      "Error updating shop metafield"
    );
    const statusCode = [401, 403].includes(error.statusCode)
      ? error.statusCode
      : 500;
    await reply.code(statusCode).send({
      success: false,
      error: statusCode === 500 ? "Internal server error" : error.message,
    });
  }
};

route.options = {
  cors: {
    origin: true
  },
  schema: {
    body: {
      type: "object",
      properties: {
        shopId: { type: "string" },
        learnMoreUrl: { type: "string" },
        desktopImageUrl: { type: "string" },
        mobileImageUrl: { type: "string" }
      },
      required: ["learnMoreUrl"]
    }
  }
};

export default route;
