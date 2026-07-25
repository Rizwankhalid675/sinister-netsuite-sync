// Create a shop-scoped admin user. Super Admin (MANAGE_USERS) picks name,
// email, personId, and role; shop + status("invited") + createdByEmail are
// stamped server-side by appUser/actions/create.js. See appUserPolicy.js for
// field/role validation and the MANAGE_USERS gate.
const route = async ({ request, body, reply, api, logger }) => {
  const input = body || request?.body || {};
  try {
    const result = await api.appUser.create({
      name: input.name,
      email: input.email,
      personId: input.personId,
      role: input.role ? { _link: String(input.role) } : undefined,
    });
    await reply.code(201).send({ success: true, user: result });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error creating user");
    const statusCode = [400, 401, 403, 409].includes(error?.statusCode) ? error.statusCode : 500;
    await reply
      .code(statusCode)
      .send({ success: false, error: statusCode === 500 ? "Internal server error while creating user" : error.message });
  }
};
export default route;
