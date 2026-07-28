// Update a claim (status transitions, value edits, notes). RBAC and the
// claim status state machine are enforced inside claim/actions/update.js —
// this route is a thin dispatcher, matching the users PATCH route pattern.
const route = async ({ request, body, params, reply, api, logger }) => {
  const input = body || request?.body || {};
  const id = params?.id;
  if (!id) {
    await reply.code(400).send({ success: false, error: "Claim id is required" });
    return;
  }
  const patch = {};
  if (input.status !== undefined) patch.status = input.status;
  if (input.transitionNote !== undefined) patch.transitionNote = input.transitionNote;
  if (input.reason !== undefined) patch.reason = input.reason;
  if (input.claimValueMinor !== undefined) patch.claimValueMinor = input.claimValueMinor;
  if (input.claimCurrency !== undefined) patch.claimCurrency = input.claimCurrency;
  try {
    const result = await api.claim.update(String(id), patch);
    await reply.send({ success: true, claim: result });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error updating claim");
    const statusCode = [400, 401, 403, 404, 409].includes(error?.statusCode) ? error.statusCode : 500;
    await reply
      .code(statusCode)
      .send({ success: false, error: statusCode === 500 ? "Internal server error while updating claim" : error.message });
  }
};
export default route;
