const EXPECTED_TOPIC = "carts/update";
const SHOP_DOMAIN = /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/;

export function normalizeWebhookTopic(value) {
  const topic = typeof value === "string" ? value.trim().toLowerCase() : "";
  return topic === EXPECTED_TOPIC ? topic : null;
}

export function normalizeShopDomain(value) {
  const domain = typeof value === "string" ? value.trim().toLowerCase() : "";
  return SHOP_DOMAIN.test(domain) ? domain : null;
}

export function hasFieldUniqueViolation(error, field) {
  if (
    error?.code !== "GGT_INVALID_RECORD"
    || error?.name !== "InvalidRecordError"
    || !Array.isArray(error.validationErrors)
  ) {
    return false;
  }
  return error.validationErrors.some(
    (item) =>
      item?.apiIdentifier === field
      && /(?:not unique|already (?:exists|taken)|must be unique)/i.test(
        String(item.message ?? "")
      )
  );
}

export const hasDeliveryKeyUniqueViolation = (error) =>
  hasFieldUniqueViolation(error, "deliveryKey");

export const WEBHOOK_LEASE_SECONDS = 300;

export function constantTimeHexEqual(left, right) {
  if (
    typeof left !== "string"
    || typeof right !== "string"
    || !/^[0-9a-f]{64}$/i.test(left)
    || !/^[0-9a-f]{64}$/i.test(right)
  ) {
    return false;
  }
  const leftBytes = Buffer.from(left, "hex");
  const rightBytes = Buffer.from(right, "hex");
  return crypto.timingSafeEqual(leftBytes, rightBytes);
}

export async function acquireWebhookAttempt(
  api,
  deliveryKey,
  { now = new Date(), leaseSeconds = WEBHOOK_LEASE_SECONDS } = {}
) {
  const latestRows = await api.webhookAttempt.findMany({
    filter: { deliveryKey: { equals: deliveryKey } },
    sort: { attemptNumber: "Descending" },
    first: 1,
    select: {
      id: true,
      attemptNumber: true,
      status: true,
      leaseExpiresAt: true,
    },
  });
  const latest = latestRows[0];
  if (latest?.status === "processed") return { acquired: false, reason: "processed" };
  if (
    latest?.status === "processing"
    && new Date(latest.leaseExpiresAt).getTime() > now.getTime()
  ) {
    return { acquired: false, reason: "active" };
  }
  const attemptNumber = Number(latest?.attemptNumber ?? 0) + 1;
  const attemptKey = `${deliveryKey}:attempt:${attemptNumber}`;
  try {
    const attempt = await api.webhookAttempt.create({
      attemptKey,
      deliveryKey,
      attemptNumber,
      status: "processing",
      leaseExpiresAt: new Date(
        now.getTime() + leaseSeconds * 1000
      ).toISOString(),
    });
    return { acquired: true, attempt };
  } catch (error) {
    if (hasFieldUniqueViolation(error, "attemptKey")) {
      return { acquired: false, reason: "active" };
    }
    throw error;
  }
}
import crypto from "node:crypto";
