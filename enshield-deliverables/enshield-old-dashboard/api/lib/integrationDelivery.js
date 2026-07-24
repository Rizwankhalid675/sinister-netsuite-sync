import { createHash } from "node:crypto";
import { writeAudit } from "./audit.js";
import { hasFieldUniqueViolation } from "./webhookReceiptLease.js";

export const DELIVERY_STATUS = Object.freeze({
  QUEUED: "queued",
  PROCESSING: "processing",
  SUCCEEDED: "succeeded",
  RETRY: "retry",
  PERMANENT_FAILURE: "permanent_failure",
});

const SAFE_METADATA_KEYS = new Set([
  "endpoint",
  "resourceType",
  "resourceId",
]);

export function createDeliveryKey({ shopId, operation, sourceId }) {
  if (!shopId || !operation || !sourceId) {
    throw new Error("shopId, operation, and sourceId are required");
  }
  return createHash("sha256")
    .update(`${String(shopId)}\0${String(operation)}\0${String(sourceId)}`)
    .digest("hex");
}

export function createTrackingDeliverySourceId(orderId, trackingNumber) {
  if (!orderId || !trackingNumber) {
    throw new Error("orderId and trackingNumber are required");
  }
  const trackingHash = createHash("sha256")
    .update(String(trackingNumber))
    .digest("hex");
  return `${String(orderId)}:${trackingHash}`;
}

function safeMetadata(metadata) {
  return Object.fromEntries(
    Object.entries(metadata || {}).filter(
      ([key, value]) =>
        SAFE_METADATA_KEYS.has(key) &&
        ["string", "number", "boolean"].includes(typeof value)
    )
  );
}

export function sanitizeDeliveryError(_error, statusCode) {
  const numericStatus = Number(statusCode);
  const code =
    Number.isInteger(numericStatus) && numericStatus >= 100
      ? `HTTP_${numericStatus}`
      : "DELIVERY_FAILED";
  return {
    code,
    retryable:
      !Number.isInteger(numericStatus) ||
      numericStatus === 408 ||
      numericStatus === 429 ||
      numericStatus >= 500,
  };
}

const SAFE_OUTCOME_CODES = new Set([
  "CONFIGURATION_MISSING",
  "ORDER_NOT_FOUND",
  "TRACKING_NOT_FOUND",
  "NOT_PROTECTED",
  "UNKNOWN_OPERATION",
  "DELIVERY_FAILED",
]);

export function safeOutcomeErrorCode(value, fallback = "DELIVERY_FAILED") {
  const code = String(value || "");
  if (SAFE_OUTCOME_CODES.has(code) || /^HTTP_[1-5][0-9]{2}$/.test(code)) {
    return code;
  }
  return /^HTTP_[1-5][0-9]{2}$/.test(String(fallback))
    ? String(fallback)
    : "DELIVERY_FAILED";
}

export async function enqueueDeliveryProcessor({
  api,
  deliveryId,
  shopId,
  logger,
}) {
  try {
    await api.enqueue(api.processIntegrationDelivery, {
      deliveryId,
      shopId,
    });
    return true;
  } catch (_error) {
    logger.warn(
      { deliveryId, shopId, code: "processor_enqueue_failed" },
      "Delivery remains persisted for scheduled sweep"
    );
    return false;
  }
}

export async function enqueueDelivery({
  api,
  shopId,
  operation,
  sourceId,
  metadata,
}) {
  const deliveryKey = createDeliveryKey({ shopId, operation, sourceId });
  const filter = {
    AND: [
      { deliveryKey: { equals: deliveryKey } },
      { shopId: { equals: shopId } },
    ],
  };
  const existing = await api.integrationDelivery.findFirst({ filter });
  if (existing) return existing;

  try {
    return await api.internal.integrationDelivery.create({
      deliveryKey,
      operation,
      sourceId: String(sourceId),
      status: DELIVERY_STATUS.QUEUED,
      attemptCount: 0,
      metadata: safeMetadata(metadata),
      shop: { _link: String(shopId) },
    });
  } catch (error) {
    // A unique-key race means another worker safely won the enqueue.
    const raced = await api.integrationDelivery.findFirst({ filter });
    if (raced) return raced;
    throw error;
  }
}

export async function claimDeliveryLease({
  api,
  deliveryId,
  shopId,
  now = new Date(),
  leaseMs = 60_000,
}) {
  const delivery = await api.integrationDelivery.findFirst({
    filter: {
      AND: [
        { id: { equals: deliveryId } },
        { shopId: { equals: shopId } },
      ],
    },
  });
  if (!delivery) return null;
  const leaseActive =
    delivery.status === DELIVERY_STATUS.PROCESSING &&
    delivery.leaseExpiresAt &&
    new Date(delivery.leaseExpiresAt).getTime() > now.getTime();
  const due =
    !delivery.nextAttemptAt ||
    new Date(delivery.nextAttemptAt).getTime() <= now.getTime();
  if (
    leaseActive ||
    !due ||
    ![
      DELIVERY_STATUS.QUEUED,
      DELIVERY_STATUS.RETRY,
      DELIVERY_STATUS.PROCESSING,
    ].includes(delivery.status)
  ) {
    return null;
  }

  const latestAttempts = await api.integrationDeliveryAttempt.findMany({
    filter: { deliveryKey: { equals: delivery.deliveryKey } },
    sort: { attemptNumber: "Descending" },
    first: 1,
    select: {
      id: true,
      attemptNumber: true,
      status: true,
      leaseExpiresAt: true,
    },
  });
  const latest = latestAttempts[0];
  if (
    latest?.status === "processing" &&
    new Date(latest.leaseExpiresAt).getTime() > now.getTime()
  ) {
    return null;
  }
  const attemptNumber = Number(latest?.attemptNumber || 0) + 1;
  let attempt;
  try {
    attempt = await api.integrationDeliveryAttempt.create({
      attemptKey: `${delivery.deliveryKey}:attempt:${attemptNumber}`,
      deliveryKey: delivery.deliveryKey,
      deliveryId: String(delivery.id),
      attemptNumber,
      status: "processing",
      leaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
    });
  } catch (error) {
    if (hasFieldUniqueViolation(error, "attemptKey")) return null;
    throw error;
  }

  const claimed = await api.internal.integrationDelivery.update(delivery.id, {
    status: DELIVERY_STATUS.PROCESSING,
    attemptCount: attemptNumber,
    leaseExpiresAt: new Date(now.getTime() + leaseMs).toISOString(),
    lastAttemptAt: now.toISOString(),
  });
  return { ...claimed, attemptId: attempt.id };
}

export async function completeDeliveryAttempt({
  api,
  delivery,
  outcome,
  now = new Date(),
  maxAttempts = 5,
  baseDelayMs = 30_000,
  maxDelayMs = 60 * 60_000,
}) {
  if (outcome.ok) {
    if (delivery.attemptId) {
      await api.internal.integrationDeliveryAttempt.update(delivery.attemptId, {
        status: "succeeded",
        completedAt: now.toISOString(),
      });
    }
    return api.internal.integrationDelivery.update(delivery.id, {
      status: DELIVERY_STATUS.SUCCEEDED,
      completedAt: now.toISOString(),
      leaseExpiresAt: null,
      nextAttemptAt: null,
      lastStatusCode: outcome.statusCode || null,
      lastErrorCode: null,
    });
  }

  const sanitized = sanitizeDeliveryError(outcome.error, outcome.statusCode);
  const errorCode = safeOutcomeErrorCode(outcome.errorCode, sanitized.code);
  const retryable = outcome.retryable ?? sanitized.retryable;
  const exhausted = Number(delivery.attemptCount || 0) >= maxAttempts;
  const status =
    retryable && !exhausted
      ? DELIVERY_STATUS.RETRY
      : DELIVERY_STATUS.PERMANENT_FAILURE;
  const delay = Math.min(
    maxDelayMs,
    baseDelayMs * 2 ** Math.max(0, Number(delivery.attemptCount || 1) - 1)
  );
  if (delivery.attemptId) {
    await api.internal.integrationDeliveryAttempt.update(delivery.attemptId, {
      status: "failed",
      completedAt: now.toISOString(),
      failureCode: errorCode,
    });
  }
  return api.internal.integrationDelivery.update(delivery.id, {
    status,
    leaseExpiresAt: null,
    nextAttemptAt:
      status === DELIVERY_STATUS.RETRY
        ? new Date(now.getTime() + delay).toISOString()
        : null,
    lastStatusCode: outcome.statusCode || null,
    lastErrorCode: errorCode,
    completedAt:
      status === DELIVERY_STATUS.PERMANENT_FAILURE
        ? now.toISOString()
        : null,
  });
}

export async function replayDelivery({
  api,
  deliveryId,
  shopId,
  actor,
  now = new Date(),
}) {
  const delivery = await api.integrationDelivery.findFirst({
    filter: {
      AND: [
        { id: { equals: deliveryId } },
        { shopId: { equals: shopId } },
      ],
    },
  });
  if (!delivery || delivery.status !== DELIVERY_STATUS.PERMANENT_FAILURE) {
    const error = new Error("Delivery is not replayable");
    error.statusCode = 409;
    throw error;
  }
  const replayed = await api.internal.integrationDelivery.update(delivery.id, {
    status: DELIVERY_STATUS.QUEUED,
    attemptCount: 0,
    nextAttemptAt: now.toISOString(),
    leaseExpiresAt: null,
    completedAt: null,
    lastErrorCode: null,
    lastStatusCode: null,
  });
  await writeAudit(api, {
    action: "integrationDelivery.replay",
    entityType: "integrationDelivery",
    entityId: delivery.id,
    shopId,
    actorEmail: actor?.email,
    before: { status: delivery.status },
    after: { status: DELIVERY_STATUS.QUEUED },
  });
  return replayed;
}
