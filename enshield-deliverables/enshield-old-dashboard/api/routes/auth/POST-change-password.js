// Change the current appUser's password. Requires an authenticated person
// session (personId set — i.e. user already logged in with temp/current
// password). Used both for the forced first-login change (mustChangePassword)
// and voluntary password changes later. Requires the current password to
// avoid session-hijack password takeover.
import { hashPassword, verifyPassword } from "../../lib/authPassword.js";
import { requireIdentity } from "../../lib/permissions.js";

const route = async ({ request, body, reply, api, session, logger }) => {
  const input = body || request?.body || {};
  try {
    const identity = await requireIdentity({ api, session });
    if (identity.user.principalType !== "person") {
      const error = new Error("Forbidden");
      error.statusCode = 403;
      throw error;
    }

    const currentPassword =
      typeof input.currentPassword === "string" ? input.currentPassword : "";
    const newPassword = typeof input.newPassword === "string" ? input.newPassword : "";
    if (!currentPassword || !newPassword) {
      const error = new Error("Current and new password are required");
      error.statusCode = 400;
      throw error;
    }
    if (newPassword.length < 8) {
      const error = new Error("New password must be at least 8 characters");
      error.statusCode = 400;
      throw error;
    }
    if (newPassword === currentPassword) {
      const error = new Error("New password must be different from the current password");
      error.statusCode = 400;
      throw error;
    }

    const appUser = await api.appUser.findOne(identity.user.id, {
      select: { id: true, passwordHash: true },
    });

    const ok = await verifyPassword(currentPassword, appUser.passwordHash);
    if (!ok) {
      const error = new Error("Current password is incorrect");
      error.statusCode = 401;
      throw error;
    }

    const passwordHash = await hashPassword(newPassword);
    await api.appUser.update(appUser.id, {
      passwordHash,
      mustChangePassword: false,
    });

    await reply.send({ success: true });
  } catch (error) {
    logger.error(
      { errorName: error?.name, statusCode: error?.statusCode },
      "Password change failed"
    );
    const statusCode = [400, 401, 403].includes(error?.statusCode)
      ? error.statusCode
      : 500;
    await reply
      .code(statusCode)
      .send({
        success: false,
        error: statusCode === 500 ? "Internal server error changing password" : error.message,
      });
  }
};
export default route;
