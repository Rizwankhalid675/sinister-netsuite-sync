// Confirm an appUser's email using the token emailed at invite time. Does
// NOT require an authenticated session (the user isn't logged in yet) — the
// token itself is the credential. Marks emailConfirmed=true and, if the
// user was still "invited", flips status to "active" so they can log in.
import { verifyToken } from "../../lib/authPassword.js";

const route = async ({ request, body, reply, api, logger }) => {
  const input = body || request?.body || {};
  try {
    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const token = typeof input.token === "string" ? input.token : "";
    if (!email || !token) {
      const error = new Error("Email and token are required");
      error.statusCode = 400;
      throw error;
    }

    const candidates = await api.appUser.findMany({
      filter: { email: { equals: email } },
      first: 2,
      select: {
        id: true,
        status: true,
        emailConfirmed: true,
        emailConfirmationToken: true,
        emailConfirmationExpiresAt: true,
      },
    });
    const appUser =
      candidates.length === 1 && !candidates.hasNextPage ? candidates[0] : null;

    if (!appUser) {
      const error = new Error("Invalid or expired confirmation link");
      error.statusCode = 400;
      throw error;
    }

    if (appUser.emailConfirmed) {
      await reply.send({ success: true, alreadyConfirmed: true });
      return;
    }

    const notExpired =
      appUser.emailConfirmationExpiresAt &&
      new Date(appUser.emailConfirmationExpiresAt).getTime() > Date.now();
    const tokenOk =
      notExpired && (await verifyToken(token, appUser.emailConfirmationToken));

    if (!tokenOk) {
      const error = new Error("Invalid or expired confirmation link");
      error.statusCode = 400;
      throw error;
    }

    await api.appUser.update(appUser.id, {
      emailConfirmed: true,
      emailConfirmationToken: null,
      emailConfirmationExpiresAt: null,
      status: appUser.status === "invited" ? "active" : appUser.status,
    });

    await reply.send({ success: true });
  } catch (error) {
    logger.error(
      { errorName: error?.name, statusCode: error?.statusCode },
      "Email confirmation failed"
    );
    const statusCode = [400].includes(error?.statusCode) ? error.statusCode : 500;
    await reply
      .code(statusCode)
      .send({
        success: false,
        error: statusCode === 500 ? "Internal server error confirming email" : error.message,
      });
  }
};
export default route;
