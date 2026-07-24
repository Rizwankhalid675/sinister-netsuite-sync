import crypto from "node:crypto";

const BASE64_SHA256 = /^[A-Za-z0-9+/]{43}=$/;

export function rawBodyBuffer(rawBody) {
  if (Buffer.isBuffer(rawBody)) return rawBody;
  if (typeof rawBody === "string") return Buffer.from(rawBody, "utf8");
  return null;
}

export function verifyShopifyWebhook(rawBody, hmacHeader, secret) {
  const body = rawBodyBuffer(rawBody);
  if (!body || typeof secret !== "string" || secret.length === 0) return false;
  if (typeof hmacHeader !== "string" || !BASE64_SHA256.test(hmacHeader)) {
    return false;
  }

  const supplied = Buffer.from(hmacHeader, "base64");
  const expected = crypto.createHmac("sha256", secret).update(body).digest();
  return supplied.length === expected.length
    && crypto.timingSafeEqual(supplied, expected);
}

export function buildWebhookDeliveryKey({
  webhookId,
}) {
  const suppliedId = typeof webhookId === "string" ? webhookId.trim().toLowerCase() : "";
  const trustedId = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
    suppliedId
  )
    ? suppliedId
    : "";
  return trustedId ? `webhook:${trustedId}` : null;
}

export function safeDeliveryLogId(deliveryKey) {
  return crypto
    .createHash("sha256")
    .update(String(deliveryKey))
    .digest("hex")
    .slice(0, 12);
}
