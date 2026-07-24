import { PERMISSIONS } from "../../lib/permissions.js";
import { requireInternalAccess } from "../../lib/internalAccess.js";

// appRole is a global (non shop-scoped) model — any active internal operator
// with VIEW_USERS may read the role catalog (needed to render role pickers).
const route = async ({ reply, api, logger, session }) => {
  try {
    await requireInternalAccess({ api, session }, PERMISSIONS.VIEW_USERS, "all");
    const records = await api.appRole.findMany({
      first: 100,
      sort: { name: "Ascending" },
      select: { id: true, name: true, description: true, permissions: true },
    });
    await reply.send({ success: true, roles: [...records] });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error fetching roles");
    const statusCode = [400, 401, 403, 503].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({ success: false, error: statusCode === 500 ? "Internal server error while fetching roles" : error.message });
  }
};
export default route;
