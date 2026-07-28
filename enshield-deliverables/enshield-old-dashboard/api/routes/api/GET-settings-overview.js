import { PERMISSIONS } from "../../lib/permissions.js";
import { requireInternalAccess, shopIdFilter } from "../../lib/internalAccess.js";

const route = async ({ reply, api, logger, session, query = {} }) => {
  try {
    const access = await requireInternalAccess(
      { api, session },
      PERMISSIONS.MANAGE_SETTINGS,
      query.shopId
    );
    const settings = await api.shippingInsuranceSetting.findMany({
      filter: shopIdFilter(access.shopIds),
      first: 250,
      select: { id: true, status: true, insuranceRate: true, shopId: true },
    });
    if (settings.hasNextPage) {
      const error = new Error("Settings limit exceeded");
      error.statusCode = 503;
      throw error;
    }
    const rows = [...settings];
    const single = access.shopIds.length === 1 ? rows[0] : null;
    await reply.send({
      success: true,
      scope: access.shopIds.length === 1 ? "single-client" : "assigned-clients",
      clientCount: access.shopIds.length,
      status: single?.status || (rows.some((setting) => setting.status === "active") ? "mixed" : "inactive"),
      insuranceRate: single?.insuranceRate ?? null,
      configuredCount: rows.length,
    });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error fetching settings overview");
    const statusCode = [400, 401, 403, 503].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({
      success: false,
      error: statusCode === 500 ? "Internal server error while fetching settings" : error.message,
    });
  }
};

export default route;
