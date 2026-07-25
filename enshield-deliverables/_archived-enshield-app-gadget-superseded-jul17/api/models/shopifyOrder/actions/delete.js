import { deleteRecord, ActionOptions } from "gadget-server";
import { preventCrossShopDataAccess } from "gadget-server/shopify";

/** @type { ActionRun } */
export const run = async ({ params, record, logger, api, connections }) => {
  await preventCrossShopDataAccess(params, record);
  await deleteRecord(record);
};

/** @type { ActionOnSuccess } */
export const onSuccess = async ({ record, logger, api, connections, config }) => {
  // Check if order had shipping insurance
  const noteAttributes = record.noteAttributes || [];
  const hasInsurance = noteAttributes.some(attr => 
    attr.name === 'shippingInsurance' && attr.value === 'true'
  );
  
  if (!hasInsurance) {
    logger.info({ orderId: record.id }, 'Order did not have insurance, skipping Enshield notification');
    return;
  }
  
  // Notify Enshield API about the deleted order
  const apiKey = config.ENSHIELD_API_KEY;
  if (!apiKey) {
    logger.error('ENSHIELD_API_KEY not configured');
    return;
  }
  
  // Extract numeric order ID from GID
  const numericOrderId = record.id.split('/').pop();
  const enshieldUrl = `https://manage.enshield.com/api/orders/miva/${numericOrderId}`;
  
  try {
    logger.info({ orderId: record.id, numericOrderId, enshieldUrl }, 'Notifying Enshield about deleted order');
    
    const response = await fetch(enshieldUrl, {
      method: 'DELETE',
      headers: {
        'X-Api-Key': apiKey
      }
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ orderId: record.id, status: response.status, error: errorText }, 'Enshield API returned error for deletion');
    } else {
      logger.info({ orderId: record.id }, 'Successfully notified Enshield about deleted order');
    }
  } catch (error) {
    logger.error({ orderId: record.id, error: error.message }, 'Failed to notify Enshield about deleted order');
  }
};

/** @type { ActionOptions } */
export const options = { actionType: "delete" };