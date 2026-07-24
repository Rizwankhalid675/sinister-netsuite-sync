import { authorizeActionShop, PERMISSIONS } from "../lib/permissions.js";
import { runClientReconciliationForShop } from "../lib/clientReconciliation.js";

/**
 * Rebuild cached client aggregates from explicitly tenant-filtered sources.
 * Safe to retry: unchanged client rows are not written.
 */
export const run = async ({ api, session, trigger, params, logger }) => {
  const shopId = await authorizeActionShop(
    { api, session, trigger, params },
    PERMISSIONS.EDIT_CLIENTS
  );
  const result = await runClientReconciliationForShop({ api, shopId });
  logger.info(
    { shopId, examined: result.examined, updated: result.updated },
    "Client aggregates reconciled"
  );
  return { success: true, shopId, ...result };
};

export const params = {
  shopId: { type: "string" },
};

export const options = {
  triggers: { api: true },
};
