import { grantsForRole } from "../../lib/permissions.js";
import { resolveInternalOperator } from "../../lib/internalAccess.js";

const route = async ({ reply, api, logger, session }) => {
  try {
    const { operator, assignments } = await resolveInternalOperator({ api, session });
    const assignmentPermissions = assignments.map((item) => grantsForRole(item.role?.name));
    const permissions = assignmentPermissions.length
      ? assignmentPermissions[0].filter((permission) =>
          assignmentPermissions.every((grants) => grants.includes(permission))
        )
      : [];
    const clients = assignments.map((item) => ({
      shopId: item.shopId,
      name: item.shop?.name || item.shop?.domain || item.shopId,
      roleKey: item.role?.name,
      permissions: grantsForRole(item.role?.name),
    }));
    await reply.send({
      roleKey: clients.length === 1 ? clients[0].roleKey : "Assigned operator",
      roleLabel: clients.length === 1 ? clients[0].roleKey : "Assigned operator",
      permissions,
      clients,
      user: { id: operator.id, name: operator.name, email: operator.email, principalType: "internal_operator" },
    });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "GET /api/me failed");
    const statusCode = [401, 403, 503].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({ roleKey: null, roleLabel: null, permissions: [], clients: [], user: null, error: statusCode === 500 ? "Failed to resolve identity" : error.message });
  }
};
export default route;
