import { save } from "gadget-server";
import { writeAudit } from "../../../lib/audit.js";
import {
  PERMISSIONS,
  requireIdentity,
  requirePermission,
} from "../../../lib/permissions.js";

/**
 * Soft-delete an admin user. We never hard-delete: instead we flip status
 * to "deactivated" so audit history and claim/order attribution stay intact.
 * This overrides the default destructive delete behavior.
 */
export const run = async ({ record, logger, api, session }) => {
  await requirePermission({ api, session }, PERMISSIONS.MANAGE_USERS);
  const identity = await requireIdentity({ api, session });
  if (String(record.shopId ?? record.shop?.id) !== String(identity.shopId)) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }
  const before = { status: record.status };

  record.status = "deactivated";

  const actorEmail = identity.user.email || null;
  if (actorEmail) {
    record.updatedByEmail = actorEmail;
  }

  await save(record);
  record._before = before;
  record.__actorEmail = actorEmail;
};

export const onSuccess = async ({ record, api, session }) => {
  const shopId = record.shopId ?? record.shop?.id;
  if (!shopId) return;

  await writeAudit(api, {
    action: "appUser.deactivate",
    entityType: "appUser",
    entityId: record.id,
    shopId,
    actorEmail: record.__actorEmail || null,
    before: record._before ?? { status: "unknown" },
    after: { status: "deactivated" },
  });
};

export const options = {
  // Runs on the delete action but performs a soft-deactivation instead.
  actionType: "delete",
};
