import { PERMISSIONS, requirePermission, ROLE_NAMES, grantsForRole } from "../../lib/permissions.js";
import { withAppRoleSeedEscape } from "../../lib/operatorProvisioning.js";

// appRole is a global (non shop-scoped) catalog of role -> permission
// mappings — any shop admin with VIEW_USERS may read it to render role
// pickers on the Users page.
//
// DEV/INIT SELF-HEAL: if the environment's appRole table is still empty
// (seedAppRoles was never run against this environment), lazily seed the
// standard roles here so the Users page role picker is never blank. This
// mirrors api/actions/seedAppRoles.js exactly and is a no-op once roles
// exist. Never runs in production (withAppRoleSeedEscape enforces that).
const route = async ({ reply, api, logger, session }) => {
  try {
    await requirePermission({ api, session }, PERMISSIONS.VIEW_USERS);
    let records = await api.appRole.findMany({
      first: 100,
      sort: { name: "Ascending" },
      select: { id: true, name: true, description: true, permissions: true },
    });

    const existingNames = new Set(records.map((r) => r.name));
    const missingNames = ROLE_NAMES.filter((name) => !existingNames.has(name));

    if (missingNames.length > 0 && process.env.NODE_ENV !== "production") {
      for (const name of missingNames) {
        await withAppRoleSeedEscape(() =>
          api.appRole.create({
            name,
            description: `${name} role for the Enshield internal dashboard.`,
            permissions: grantsForRole(name),
          })
        );
      }
      records = await api.appRole.findMany({
        first: 100,
        sort: { name: "Ascending" },
        select: { id: true, name: true, description: true, permissions: true },
      });
      logger.info({ count: records.length, added: missingNames }, "Lazily seeded missing appRoles from GET-roles");
    }

    await reply.send({ success: true, roles: [...records] });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error fetching roles");
    const statusCode = [400, 401, 403, 503].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({ success: false, error: statusCode === 500 ? "Internal server error while fetching roles" : error.message });
  }
};
export default route;
