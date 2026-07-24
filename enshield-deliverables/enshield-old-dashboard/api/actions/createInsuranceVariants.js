import {
  authorizeActionShop,
  PERMISSIONS,
} from "../lib/permissions.js";

/**
 * Legacy bulk ladders assumed two-decimal USD prices and could silently pick
 * the wrong protection charge. Exact variants are handled on demand by the
 * canonical pricing route; this action remains only to fail old callers safely.
 *
 * @type {ActionRun}
 */
export const run = async ({ params, api, session, trigger }) => {
  const shopId = await authorizeActionShop(
    { api, session, trigger, params },
    PERMISSIONS.MANAGE_STOREFRONT_CONFIGURATION
  );
  await api.shippingInsuranceProduct.findFirst({
    filter: { shopId: { equals: shopId } },
    select: { id: true },
  });
  throw new Error(
    "Bulk protection variant generation is disabled; use exact configured pricing"
  );
};

export const params = {
  shopId: { type: "string" },
};
