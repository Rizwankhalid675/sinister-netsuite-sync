import {
  authorizeActionShop,
  PERMISSIONS,
  requireIdentity,
} from "../lib/permissions.js";
import { replayDelivery } from "../lib/integrationDelivery.js";

export const run = async ({ api, session, trigger, params, logger }) => {
  const shopId = await authorizeActionShop(
    { api, session, trigger, params },
    PERMISSIONS.REPLAY_DELIVERIES
  );
  if (!params.deliveryId) throw new Error("deliveryId is required");
  const { user } = await requireIdentity({ api, session });
  const delivery = await replayDelivery({
    api,
    deliveryId: params.deliveryId,
    shopId,
    actor: user,
  });
  logger.info(
    { deliveryId: delivery.id, shopId },
    "Integration delivery queued for replay"
  );
  return {
    success: true,
    deliveryId: delivery.id,
    shopId,
    status: delivery.status,
  };
};

export const onSuccess = async ({ result, api, logger }) => {
  const { enqueueDeliveryProcessor } = await import(
    "../lib/integrationDelivery.js"
  );
  await enqueueDeliveryProcessor({
    api,
    deliveryId: result.deliveryId,
    shopId: result.shopId,
    logger,
  });
};

export const params = {
  deliveryId: { type: "string" },
  shopId: { type: "string" },
};

export const options = { triggers: { api: true }, transactional: true };
