import {
  authorizeActionShop,
  PERMISSIONS,
} from "../lib/permissions.js";
import {
  enqueueDelivery,
  enqueueDeliveryProcessor,
  createDeliveryKey as createKeyForLookup,
} from "../lib/integrationDelivery.js";

/**
 * Persist an order delivery request. Network delivery is deliberately handled
 * by processIntegrationDelivery only after this durable row exists.
 */
export const run = async ({ params, logger, api, session, trigger }) => {
  const shopId = await authorizeActionShop(
    { api, session, trigger, params },
    PERMISSIONS.MANAGE_ORDERS
  );
  if (!params.orderId) throw new Error("orderId is required");
  const before = await api.integrationDelivery.findFirst({
    filter: {
      AND: [
        {
          deliveryKey: {
            equals: createKeyForLookup({
              shopId,
              operation: "order.submit",
              sourceId: params.orderId,
            }),
          },
        },
        { shopId: { equals: shopId } },
      ],
    },
  });
  const delivery = await enqueueDelivery({
    api,
    shopId,
    operation: "order.submit",
    sourceId: params.orderId,
    metadata: { endpoint: "order", resourceType: "shopifyOrder" },
  });
  const processorEnqueued = await enqueueDeliveryProcessor({
    api,
    deliveryId: delivery.id,
    shopId,
    logger,
  });
  logger.info(
    { deliveryId: delivery.id, operation: "order.submit", shopId },
    "Enshield order delivery queued"
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
};

export const options = { triggers: { api: true } };
