import { applyParams, save } from "gadget-server";
import { preventCrossShopDataAccess } from "gadget-server/shopify";
import { isProtectionEligible, getProtectionPriceSnapshot, assertProtectionSnapshotImmutable } from "../../../lib/protection.js";
import {
  createTrackingDeliverySourceId,
  enqueueDelivery,
  enqueueDeliveryProcessor,
} from "../../../lib/integrationDelivery.js";

/** @type { ActionRun } */
export const run = async ({ params, record, logger, api, connections }) => {
  for (const field of [
    "enshieldProtectionAmountMinor",
    "enshieldProtectionCurrency",
    "enshieldPricingVersion",
  ]) {
    if (params?.[field] !== undefined) throw new Error("Protection snapshot is immutable");
  }
  applyParams(params, record);
  await preventCrossShopDataAccess(params, record);

  // Backfill/compute the protection snapshot on update too: orders can be
  // re-synced from Shopify (e.g. edited, or bulk re-ingested) and may not
  // have had a snapshot computed yet, or line items/attributes may have
  // changed since creation. Once a real (non-null) snapshot exists it is
  // treated as immutable going forward to avoid clobbering a charged price.
  try {
    const existing = {
      amountMinor: record.enshieldProtectionAmountMinor,
      currency: record.enshieldProtectionCurrency,
      pricingVersion: record.enshieldPricingVersion,
    };
    if (isProtectionEligible(record) && existing.amountMinor == null) {
      const snapshot = getProtectionPriceSnapshot(record);
      if (snapshot) {
        assertProtectionSnapshotImmutable(existing, snapshot);
        record.enshieldProtectionAmountMinor = snapshot.amountMinor;
        record.enshieldProtectionCurrency = snapshot.currency;
        record.enshieldPricingVersion = snapshot.pricingVersion ?? null;
      }
    }
  } catch (error) {
    logger.error({ errorName: error?.name, orderId: record.id }, "Failed to compute protection snapshot on update");
  }

  await save(record);
};

/** @type { ActionOnSuccess } */
export const onSuccess = async ({ record, logger, api, connections, config }) => {
  // Check if order had shipping insurance
  if (!isProtectionEligible(record)) {
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
            logger.info({ orderId: record.id }, 'Tracking information found, enqueueing sendTrackingToEnshield action');
            
            const delivery = await enqueueDelivery({
              api,
              shopId: record.shopId,
              operation: "tracking.submit",
              sourceId: createTrackingDeliverySourceId(
                record.id,
                firstTracking.number
              ),
              metadata: {
                endpoint: "store-tracking-number",
                resourceType: "shopifyOrder",
                resourceId: record.id,
              },
            });
            await enqueueDeliveryProcessor({
              api,
              deliveryId: delivery.id,
              shopId: record.shopId,
              logger,
            });
            
            // Only process the first tracking number found
            break;
          }
        }
      }
    }
  } catch (error) {
    logger.error({ orderId: record.id, errorName: error?.name }, 'Failed to check for tracking information');
  }
};

/** @type { ActionOptions } */
export const options = { actionType: "update" };
