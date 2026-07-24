import { applyParams, save } from "gadget-server";
import { writeAudit } from "../../../lib/audit.js";
import { PERMISSIONS, requirePermission } from "../../../lib/permissions.js";

/**
 * Create a client (one per Shopify store). storeId/storeName/shop are required
 * by the schema. Stamps createdByEmail from the session and records an audit
 * entry. Bulk creation from shopifyShop is handled by the backfill global
 * action, which calls this via api.internal.client.create.
 */
export const run = async ({ params, record, logger, api, session }) => {
  await requirePermission({ api, session }, PERMISSIONS.EDIT_CLIENTS);
  applyParams(params, record);

  const actorEmail = session?.get("email") || null;
  if (actorEmail) {
    record.createdByEmail = actorEmail;
  }

  await save(record);
};

export const onSuccess = async ({ record, api, session }) => {
  const shopId = record.shopId ?? record.shop?.id;
  if (!shopId) return;

  await writeAudit(api, {
    action: "client.create",
    entityType: "client",
    entityId: record.id,
    shopId,
    actorEmail: session?.get("email") || null,
    before: null,
    after: { status: record.status, storeName: record.storeName },
  });
};

export const options = {
  actionType: "create",
};
