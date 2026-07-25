import { PERMISSIONS, requirePermission } from "../../lib/permissions.js";

// appRole is a global (non shop-scoped) catalog of role -> permission
// mappings — any shop admin with VIEW_USERS may read it to render role
// pickers on the Users page.
const route = async ({ reply, api, logger, session }) => {
  try {
    await requirePermission({ api, session }, PERMISSIONS.VIEW_USERS);
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
