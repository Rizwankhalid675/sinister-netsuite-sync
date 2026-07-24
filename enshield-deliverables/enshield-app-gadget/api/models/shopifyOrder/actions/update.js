import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossShopDataAccess } from "gadget-server/shopify";

/** @type { ActionRun } */
export const run = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossShopDataAccess(params, record);
  await save(record);
};

/** @type { ActionOnSuccess } */
export const onSuccess = async ({ record, logger, api, connections, config }) => {
  // Check if order had shipping insurance
  const noteAttributes = record.noteAttributes || [];
  const hasInsurance = noteAttributes.some(attr => 
    attr.name === 'shippingInsurance' && attr.value === 'true'
  );
  
  if (!hasInsurance) {
    return;
  }
  
  // Check if order was refunded
  if (record.financialStatus === 'refunded') {
    logger.info({ orderId: record.id }, 'Order was refunded, notifying Enshield');
    
    const apiKey = config.ENSHIELD_API_KEY;
    if (!apiKey) {
      logger.error('ENSHIELD_API_KEY not configured');
      return;
    }
    
    // Extract numeric order ID
    const numericOrderId = record.id;
    const enshieldUrl = `https://manage.enshield.com/api/orders/miva/${numericOrderId}`;
    
    try {
      const response = await fetch(enshieldUrl, {
        method: 'DELETE',
        headers: {
          'X-Api-Key': apiKey
        }
      });
      
      if (!response.ok) {
        const errorText = await response.text();
        logger.error({ orderId: record.id, status: response.status, error: errorText }, 'Enshield API returned error for refund deletion');
      } else {
        logger.info({ orderId: record.id }, 'Successfully notified Enshield about refunded order');
      }
    } catch (error) {
      logger.error({ orderId: record.id, error: error.message }, 'Failed to notify Enshield about refunded order');
    }
    
    // Return early - no need to check for tracking if order is refunded
    return;
  }
  
  // Check for tracking information
  try {
    const shopify = await connections.shopify.forShopId(record.shopId);
    
    // Convert numeric order ID to GID format for Shopify GraphQL API
    const orderGid = `gid://shopify/Order/${record.id}`;
    
    const response = await shopify.graphql(`
      query getOrderFulfillments($id: ID!) {
        order(id: $id) {
          id
          fulfillments {
            trackingInfo {
              number
              url
            }
          }
        }
      }
    `, {
      id: orderGid
    });
    
    if (response.order && response.order.fulfillments) {
      // Look for tracking numbers in fulfillments
      for (const fulfillment of response.order.fulfillments) {
        if (fulfillment.trackingInfo && fulfillment.trackingInfo.length > 0) {
          const firstTracking = fulfillment.trackingInfo[0];
          if (firstTracking.number) {
            logger.info({ orderId: record.id, trackingNumber: firstTracking.number }, 'Tracking information found, enqueueing sendTrackingToEnshield action');
            
            // Enqueue the sendTrackingToEnshield action
            await api.enqueue(api.sendTrackingToEnshield, {
              orderId: record.id,
              shopId: record.shopId,
              trackingNumber: firstTracking.number
            });
            
            // Only process the first tracking number found
            break;
          }
        }
      }
    }
  } catch (error) {
    logger.error({ orderId: record.id, error: error.message }, 'Failed to check for tracking information');
  }
};

/** @type { ActionOptions } */
export const options = { actionType: "update" };