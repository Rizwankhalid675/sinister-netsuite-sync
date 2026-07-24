import { verifyTrustedAuthToken } from "../../lib/trustedAuth.js";
import { claimInternalAuthChallenge } from "../../lib/internalAuthReceipt.js";

const route = async ({
  reply, api, session, request, body, config, logger,
  nowSeconds = Math.floor(Date.now() / 1000),
}) => {
  try {
    const state = session?.get("internalAuthState");
    const nonce = session?.get("internalAuthNonce");
    const challengeAt = session?.get("internalAuthChallengeAt");
    session?.delete("personId");
    session?.delete("internalAuthenticatedAt");
    session?.delete("internalAuthState");
    session?.delete("internalAuthNonce");
    session?.delete("internalAuthChallengeAt");
    if (!state || !nonce) {
      const error = new Error("Authentication flow was not started");
      error.statusCode = 401;
      throw error;
    }
    if (!challengeAt || nowSeconds - Math.floor(new Date(challengeAt).getTime() / 1000) > 600) {
      const error = new Error("Authentication challenge expired");
      error.statusCode = 401;
      throw error;
    }
    const claims = verifyTrustedAuthToken(body?.token ?? request?.body?.token, {
      secret: config?.INTERNAL_AUTH_SHARED_SECRET,
      issuer: config?.INTERNAL_AUTH_ISSUER,
      audience: config?.INTERNAL_AUTH_AUDIENCE,
      state, nonce, now: nowSeconds,
    });
    await claimInternalAuthChallenge(api, {
      state,
      nonce,
      expiresAt: new Date((nowSeconds + 600) * 1000).toISOString(),
    });
    const operator = await api.internalOperator.findFirst({
      filter: {
        AND: [
          { personId: { equals: claims.sub } },
          { status: { equals: "active" } },
        ],
      },
      select: { id: true, personId: true, status: true },
    });
    if (!operator) {
      const error = new Error("Operator is not provisioned");
      error.statusCode = 403;
      throw error;
    }
    session.set("personId", operator.personId);
    session.set("internalAuthenticatedAt", new Date(nowSeconds * 1000).toISOString());
    await reply.send({ success: true });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Internal authentication failed");
    const statusCode = [401, 403, 503].includes(error?.statusCode) ? error.statusCode : 401;
    await reply.code(statusCode).send({ success: false, error: "Internal authentication failed" });
  }
};
export default route;
