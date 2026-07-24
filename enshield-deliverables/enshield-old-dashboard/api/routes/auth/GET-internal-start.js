import { randomBytes } from "node:crypto";

const route = async ({ reply, session, config }) => {
  if (!config?.INTERNAL_AUTH_HANDOFF_URL) {
    return reply.code(503).send({ success: false, error: "Internal identity provider is not configured" });
  }
  session.delete("personId");
  session.delete("internalAuthenticatedAt");
  session.delete("internalAuthState");
  session.delete("internalAuthNonce");
  session.delete("internalAuthChallengeAt");
  const state = randomBytes(32).toString("base64url");
  const nonce = randomBytes(32).toString("base64url");
  session.set("internalAuthState", state);
  session.set("internalAuthNonce", nonce);
  session.set("internalAuthChallengeAt", new Date().toISOString());
  const url = new URL(config.INTERNAL_AUTH_HANDOFF_URL);
  url.searchParams.set("state", state);
  url.searchParams.set("nonce", nonce);
  url.searchParams.set("audience", config.INTERNAL_AUTH_AUDIENCE);
  await reply.send({ success: true, authorizationUrl: url.toString() });
};
export default route;
