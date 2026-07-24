import {
  authorizeActionShop,
  PERMISSIONS,
} from "../lib/permissions.js";
import {
  createDeliveryKey,
  createTrackingDeliverySourceId,
  enqueueDelivery,
  enqueueDeliveryProcessor,
} from "../lib/integrationDelivery.js";

/**
 * Persist a tracking delivery request. The supplied tracking value is accepted
 * for backwards compatibility but is intentionally not stored or logged; the
 * processor reconstructs current tracking data from Shopify.
 */
export const run = async ({ params, logger, api, session, trigger }) => {
  const shopId = await authorizeActionShop(
    { api, session, trigger, params },
    PERMISSIONS.MANAGE_ORDERS
  );
  if (!params.orderId) throw new Error("orderId is required");
  if (!params.trackingNumber) throw new Error("trackingNumber is required");
  const sourceId = createTrackingDeliverySourceId(
    params.orderId,
    params.trackingNumber
  );
  const deliveryKey = createDeliveryKey({
    shopId,
    operation: "tracking.submit",
    sourceId,
  });
  const before = await api.integrationDelivery.findFirst({
    filter: {
      AND: [
        { deliveryKey: { equals: deliveryKey } },
        { shopId: { equals: shopId } },
      ],
    },
  });
  const delivery = await enqueueDelivery({
    api,
    shopId,
    operation: "tracking.submit",
    sourceId,
    metadata: {
      endpoint: "store-tracking-number",
      resourceType: "shopifyOrder",
      resourceId: params.orderId,
    },
  });
  const processorEnqueued = await enqueueDeliveryProcessor({
    api,
    deliveryId: delivery.id,
    shopId,
    logger,
  });
  logger.info(
    { deliveryId: delivery.id, operation: "tracking.submit", shopId },
    "Enshield tracking delivery queued"
  );
  return {
    success: true,
    queued: true,
    deliveryId: delivery.id,
    duplicate: Boolean(before),
    processorEnqueued,
  };
};

export const params = {
  orderId: { type: "string" },
  shopId: { type: "string" },
  trackingNumber: { type: "string" },
};

export const options = { triggers: { api: true } };
