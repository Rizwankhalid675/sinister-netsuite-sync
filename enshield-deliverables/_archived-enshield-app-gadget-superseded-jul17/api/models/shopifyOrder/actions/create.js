import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossShopDataAccess } from "gadget-server/shopify";

/** @type { ActionRun } */
export const run = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossShopDataAccess(params, record);
  await save(record);
};

/** @type { ActionOnSuccess } */
export const onSuccess = async ({ record, logger, api }) => {
  // Check if order has shipping insurance
  const noteAttributes = record.noteAttributes || [];
  const hasInsurance = noteAttributes.some(attr => 
    attr.name === 'shippingInsurance' && attr.value === 'true'
  );
  
  if (hasInsurance) {
    logger.info({ orderId: record.id }, 'Order has shipping insurance, sending to Enshield');
    try {
      await api.enqueue(api.sendOrderToEnshield, {
        orderId: record.id,
        shopId: record.shopId
      });
    } catch (error) {
      logger.error({ error, orderId: record.id }, 'Failed to enqueue Enshield order sync');
    }
  }
};

/** @type { ActionOptions } */
export const options = { actionType: "create" };
