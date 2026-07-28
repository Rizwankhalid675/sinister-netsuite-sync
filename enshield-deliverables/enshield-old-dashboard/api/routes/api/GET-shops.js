// List shops for the "specific stores" access-scope picker on the user
// creation/edit form. Requires MANAGE_USERS (only user-management screens
// need a cross-store shop list). Returns id + domain only.
import {
  PERMISSIONS,
  requirePermission,
} from "../../lib/permissions.js";

const route = async ({ reply, api, logger, session }) => {
  try {
    await requirePermission({ api, session }, PERMISSIONS.MANAGE_USERS);

    const shops = await api.shopifyShop.findMany({
      select: { id: true, domain: true, myshopifyDomain: true },
      sort: { domain: "Ascending" },
      first: 250,
    });

    await reply.send({
      success: true,
      shops: shops.map((shop) => ({
        id: shop.id,
        domain: shop.domain || shop.myshopifyDomain,
      })),
    });
  } catch (error) {
    logger.error(
      { errorName: error?.name, statusCode: error?.statusCode },
      "Error listing shops"
    );
    const statusCode = [401, 403].includes(error?.statusCode)
      ? error.statusCode
      : 500;
    await reply.code(statusCode).send({
      success: false,
      error:
        statusCode === 500 ? "Internal server error while loading shops" : error.message,
    });
  }
};
export default route;
