// Shop picker for the "Add client" form. Only shopifyShop records that do
// NOT already have a client are returned, so operators can't double-create.
import { PERMISSIONS, requirePermission } from "../../lib/permissions.js";

const route = async ({ reply, api, logger, session }) => {
  try {
    await requirePermission({ api, session }, PERMISSIONS.EDIT_CLIENTS);

    const [shops, clients] = await Promise.all([
      api.shopifyShop.findMany({
        select: { id: true, name: true, domain: true, myshopifyDomain: true },
        sort: { domain: "Ascending" },
        first: 250,
      }),
      api.client.findMany({ select: { shopId: true }, first: 250 }),
    ]);

    const linkedShopIds = new Set(clients.map((c) => c.shopId).filter(Boolean));
    const available = shops
      .filter((shop) => !linkedShopIds.has(shop.id))
      .map((shop) => ({
        id: shop.id,
        label: shop.name || shop.domain || shop.myshopifyDomain || shop.id,
        domain: shop.domain || shop.myshopifyDomain || "",
      }));

    await reply.send({ success: true, shops: available });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error listing available shops");
    const statusCode = [401, 403].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({
      success: false,
      error: statusCode === 500 ? "Internal server error while loading shops" : error.message,
    });
  }
};
export default route;
