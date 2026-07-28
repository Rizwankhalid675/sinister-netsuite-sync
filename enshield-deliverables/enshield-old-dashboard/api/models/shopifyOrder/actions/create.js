import { applyParams, save } from "gadget-server";
import { preventCrossShopDataAccess } from "gadget-server/shopify";
import { isProtectionEligible, getProtectionPriceSnapshot } from "../../../lib/protection.js";

/** @type { ActionRun } */
export const run = async ({ params, record, logger, api, connections }) => {
  for (const field of [
    "enshieldProtectionAmountMinor",
    "enshieldProtectionCurrency",
    "enshieldPricingVersion",
  ]) {
    if (params?.[field] !== undefined) throw new Error("Protection snapshot is ingestion-managed");
  }
  applyParams(params, record);
  await preventCrossShopDataAccess(params, record);

  // Compute the Enshield protection snapshot from the order's own line items /
  // note attributes. This is ingestion-managed (blocked from direct param
  // writes above) and must be derived here so downstream dashboard metrics
  // (attach rate, insurance revenue, activeProtectedOrders) have data to read.
  try {
    if (isProtectionEligible(record)) {
      const snapshot = getProtectionPriceSnapshot(record);
      if (snapshot) {
        record.enshieldProtectionAmountMinor = snapshot.amountMinor;
        record.enshieldProtectionCurrency = snapshot.currency;
        record.enshieldPricingVersion = snapshot.pricingVersion ?? null;
      }
    }
  } catch (error) {
    logger.error({ errorName: error?.name, orderId: record.id }, "Failed to compute protection snapshot");
  }

  await save(record);
};

/** @type { ActionOnSuccess } */
export const onSuccess = async ({ record, logger, api }) => {
  // Check if order has shipping insurance
  if (isProtectionEligible(record)) {
    logger.info({ orderId: record.id }, 'Order has shipping insurance, sending to Enshield');
    try {
      await api.enqueue(api.sendOrderToEnshield, {
        orderId: record.id,
        shopId: record.shopId
      });
    } catch (error) {
      logger.error({ errorName: error?.name, orderId: record.id }, 'Failed to enqueue Enshield order sync');
    }
  }
};

/** @type { ActionOptions } */
export const options = { actionType: "create" };
