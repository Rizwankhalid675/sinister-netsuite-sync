import { createHash } from "node:crypto";

export function challengeDigest(state, nonce) {
  return createHash("sha256").update(`${state}\0${nonce}`).digest("hex");
}

export async function claimInternalAuthChallenge(api, { state, nonce, expiresAt }) {
  const digest = challengeDigest(state, nonce);
  try {
    await api.internal.internalAuthReceipt.create({
      digest,
      expiresAt,
    });
  } catch (reason) {
    const isUniqueDigestConflict =
      reason?.name === "InvalidRecordError" &&
      reason?.code === "GGT_INVALID_RECORD" &&
      Array.isArray(reason?.validationErrors) &&
      reason.validationErrors.some(
        (validationError) =>
          validationError?.apiIdentifier === "digest" &&
          /unique/i.test(validationError?.message ?? "")
      );
    if (!isUniqueDigestConflict) {
      const error = new Error("Authentication receipt store unavailable");
      error.statusCode = 503;
      throw error;
    }
    const error = new Error("Authentication challenge already consumed");
    error.statusCode = 401;
    throw error;
  }
  return digest;
}
