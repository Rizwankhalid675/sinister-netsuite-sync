import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossShopDataAccess } from "gadget-server/shopify";

/** @type { ActionRun } */
export const run = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossShopDataAccess(params, record);
  await save(record);
};

/** @type { ActionOnSuccess } */
export const onSuccess = async ({ params, record, logger, api, connections }) => {
  logger.info({ shopId: record.id }, "Shop reinstalled, enqueueing shipping insurance product creation");

  try {
    await api.enqueue(api.setupShippingInsuranceProduct, { shopId: record.id });
    logger.info({ shopId: record.id }, "Successfully enqueued shipping insurance product creation");
  } catch (error) {
    logger.error({ shopId: record.id, error }, "Failed to enqueue shipping insurance product creation");
  }
};

/** @type { ActionOptions } */
export const options = { actionType: "update" };
