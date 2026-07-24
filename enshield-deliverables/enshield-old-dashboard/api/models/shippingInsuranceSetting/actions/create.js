import { applyParams, save } from "gadget-server";
import { preventCrossShopDataAccess } from "gadget-server/shopify";
import { loadProtectionPricing } from "../../../lib/protection.js";

/** @type { ActionRun } */
export const run = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossShopDataAccess(params, record);
  loadProtectionPricing(record, new Date("9999-12-31T23:59:59.999Z"));
  const shopId = record.shopId ?? record.shop?.id;
  if (!shopId) throw new Error("Pricing shop is required");
  record.shopVersionKey = `${shopId}:${record.pricingVersion}`;
  await save(record);
};

/** @type { ActionOptions } */
export const options = {
  actionType: "create",
};
