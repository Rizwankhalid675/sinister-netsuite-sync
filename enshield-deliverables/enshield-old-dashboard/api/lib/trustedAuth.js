import { createHmac, timingSafeEqual } from "node:crypto";

const encode = (value) =>
  Buffer.from(JSON.stringify(value), "utf8").toString("base64url");

function authError(message = "Invalid authentication response") {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
}

function validateSecret(secret) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    const error = new Error("Internal authentication is not configured");
    error.statusCode = 503;
    throw error;
  }
}

export function createTrustedAuthToken({ secret, claims }) {
  validateSecret(secret);
  const header = encode({ alg: "HS256", typ: "JWT" });
  const payload = encode(claims);
  const signature = createHmac("sha256", secret)
    .update(`${header}.${payload}`)
    .digest("base64url");
  return `${header}.${payload}.${signature}`;
}

export function verifyTrustedAuthToken(
  token,
  { secret, issuer, audience, nonce, state, now = Math.floor(Date.now() / 1000) }
) {
  validateSecret(secret);
  if (typeof token !== "string") throw authError();
  const parts = token.split(".");
  if (parts.length !== 3 || parts.some((part) => !part)) throw authError();
  let header;
  let claims;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw authError();
  }
  if (header?.alg !== "HS256" || header?.typ !== "JWT") throw authError();
  const expected = createHmac("sha256", secret)
    .update(`${parts[0]}.${parts[1]}`)
    .digest();
  const supplied = Buffer.from(parts[2], "base64url");
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw authError();
  }
  if (
    claims?.iss !== issuer ||
    claims?.aud !== audience ||
    claims?.nonce !== nonce ||
    claims?.state !== state ||
    typeof claims?.sub !== "string" ||
    !/^[A-Za-z0-9._|~:@/-]{1,200}$/.test(claims.sub) ||
    !Number.isInteger(claims.iat) ||
    !Number.isInteger(claims.exp) ||
    claims.iat > claims.exp ||
    claims.iat > now + 60 ||
    claims.exp <= now ||
    claims.exp - claims.iat > 300
  ) {
    throw authError();
  }
  return claims;
}
