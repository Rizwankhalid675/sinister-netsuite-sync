import { deleteRecord } from "gadget-server";
import { preventCrossShopDataAccess } from "gadget-server/shopify";
import { isProtectionEligible } from "../../../lib/protection.js";
import {
  enqueueDelivery,
  enqueueDeliveryProcessor,
} from "../../../lib/integrationDelivery.js";

/** @type { ActionRun } */
export const run = async ({ params, record, logger, api, connections }) => {
  await preventCrossShopDataAccess(params, record);
  await deleteRecord(record);
};

/** @type { ActionOnSuccess } */
export const onSuccess = async ({ record, logger, api }) => {
  if (!isProtectionEligible(record)) {
    return;
  }
  const delivery = await enqueueDelivery({
    api,
    shopId: record.shopId,
    operation: "order.delete",
    sourceId: record.id,
    metadata: { endpoint: "order", resourceType: "shopifyOrder" },
  });
  await enqueueDeliveryProcessor({
    api,
    deliveryId: delivery.id,
    shopId: record.shopId,
    logger,
  });
};

/** @type { ActionOptions } */
export const options = { actionType: "delete" };
