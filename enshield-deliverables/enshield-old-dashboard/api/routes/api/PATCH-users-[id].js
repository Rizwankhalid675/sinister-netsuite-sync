// Update (role/name) or soft-deactivate (status: "deactivated") a shop-scoped
// admin user. RBAC (MANAGE_USERS) and shop-ownership are enforced inside
// appUser/actions/update.js and delete.js — this route is a thin dispatcher.
const route = async ({ request, body, params, reply, api, logger }) => {
  const input = body || request?.body || {};
  const id = params?.id;
  if (!id) {
    await reply.code(400).send({ success: false, error: "User id is required" });
    return;
  }
  try {
    let result;
    if (input.status === "deactivated") {
      result = await api.appUser.delete(String(id));
    } else {
      const patch = {};
      if (input.name !== undefined) patch.name = input.name;
      if (input.role !== undefined) patch.role = { _link: String(input.role) };
      result = await api.appUser.update(String(id), patch);
    }
    await reply.send({ success: true, user: result });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error updating user");
    const statusCode = [400, 401, 403, 404, 409].includes(error?.statusCode) ? error.statusCode : 500;
    await reply
      .code(statusCode)
      .send({ success: false, error: statusCode === 500 ? "Internal server error while updating user" : error.message });
  }
};
export default route;
