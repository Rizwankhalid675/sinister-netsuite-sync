// Password login for internal appUsers. The Shopify app session already
// establishes shopId/roles (embedded admin session); this route verifies
// email+password against appUser for that shop, then sets personId on the
// session so requireIdentity() can resolve the person + role + scope on
// subsequent requests. Fails closed on any ambiguity (multiple/no match,
// deactivated user, unconfirmed email, bad password).
import { verifyPassword } from "../../lib/authPassword.js";

const SHOPIFY_APP_SESSION_ROLE = "shopify-app-users";

const route = async ({ request, body, reply, api, session, logger }) => {
  const input = body || request?.body || {};
  try {
    const existingShopId = session?.get("shopId");

    const email = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
    const password = typeof input.password === "string" ? input.password : "";
    if (!email || !password) {
      const error = new Error("Email and password are required");
      error.statusCode = 400;
      throw error;
    }

    const candidates = await api.appUser.findMany({
      filter: {
        AND: [
          ...(existingShopId ? [{ shopId: { equals: existingShopId } }] : []),
          { email: { equals: email } },
        ],
      },
      first: 2,
      select: {
        id: true,
        personId: true,
        shopId: true,
        status: true,
        emailConfirmed: true,
        passwordHash: true,
        mustChangePassword: true,
      },
    });
    const appUser =
      candidates.length === 1 && !candidates.hasNextPage ? candidates[0] : null;

    // Always run verifyPassword (even against a dummy hash) to avoid timing
    // leaks that reveal whether an email exists.
    const ok = await verifyPassword(
      password,
      appUser?.passwordHash || "scrypt:00:00"
    );

    if (!appUser || appUser.status !== "active" || !ok) {
      const error = new Error("Invalid email or password");
      error.statusCode = 401;
      throw error;
    }

    if (!appUser.emailConfirmed) {
      const error = new Error("Please confirm your email before logging in");
      error.statusCode = 403;
      throw error;
    }

    session.set("shop", { _link: String(appUser.shopId) });
    session.set("roles", [SHOPIFY_APP_SESSION_ROLE]);
    session.set("personId", appUser.personId);
    session.set("internalAuthenticatedAt", new Date().toISOString());

    await reply.send({
      success: true,
      mustChangePassword: !!appUser.mustChangePassword,
    });
  } catch (error) {
    logger.error(
      { errorName: error?.name, statusCode: error?.statusCode },
      "Login failed"
    );
    const statusCode = [400, 401, 403].includes(error?.statusCode)
      ? error.statusCode
      : 500;
    await reply
      .code(statusCode)
      .send({
        success: false,
        error: statusCode === 500 ? "Internal server error during login" : error.message,
      });
  }
};
export default route;
