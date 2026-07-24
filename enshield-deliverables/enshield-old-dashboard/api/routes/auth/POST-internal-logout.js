const route = async ({ reply, session }) => {
  for (const key of [
    "personId",
    "internalAuthenticatedAt",
    "internalAuthState",
    "internalAuthNonce",
    "internalAuthChallengeAt",
  ]) {
    session?.delete(key);
  }
  await reply.send({ success: true });
};
export default route;
