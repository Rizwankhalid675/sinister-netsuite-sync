import {
  authorizeActionShop,
  PERMISSIONS,
} from "../lib/permissions.js";
import {
  claimDeliveryLease,
  completeDeliveryAttempt,
} from "../lib/integrationDelivery.js";
import { deliverToEnshield } from "../lib/enshieldDelivery.js";

export const run = async ({
  api,
  session,
  trigger,
  params,
  logger,
  config,
  connections,
}) => {
  const shopId = await authorizeActionShop(
    { api, session, trigger, params },
    PERMISSIONS.MANAGE_ORDERS
  );
  if (!params.deliveryId) throw new Error("deliveryId is required");
  const delivery = await claimDeliveryLease({
    api,
    deliveryId: params.deliveryId,
    shopId,
  });
  if (!delivery) {
    return { success: true, processed: false, reason: "not_due_or_leased" };
  }
  const shopifyClient = await connections.shopify.forShopId(shopId);
  const outcome = await deliverToEnshield({
    delivery,
    shopifyClient,
    apiKey: config.ENSHIELD_API_KEY,
    logger,
  });
  const completed = await completeDeliveryAttempt({ api, delivery, outcome });
  logger.info(
    {
      deliveryId: delivery.id,
      operation: delivery.operation,
      status: completed.status,
      statusCode: outcome.statusCode,
    },
    "Persisted Enshield delivery attempt completed"
  );
  return {
    success: completed.status === "succeeded",
    processed: true,
    deliveryId: completed.id,
    status: completed.status,
  };
};

export const params = {
  deliveryId: { type: "string" },
  shopId: { type: "string" },
};

export const options = {
  triggers: { api: true },
};
