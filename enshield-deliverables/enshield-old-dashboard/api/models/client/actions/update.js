import { applyParams, save } from "gadget-server";
import { writeAudit } from "../../../lib/audit.js";
import { PERMISSIONS, requirePermission } from "../../../lib/permissions.js";

/**
 * Update a client. Records an audit entry with a before/after status snapshot.
 * NOTE: valueInTransit and claimCount are cached-derived fields — they are the
 * responsibility of the recompute/backfill global action, not manual edits, so
 * we don't special-case them here beyond auditing whatever changed.
 */
export const run = async ({ params, record, logger, api, session }) => {
  await requirePermission({ api, session }, PERMISSIONS.EDIT_CLIENTS);
  const before = { status: record.status, plan: record.plan };

  applyParams(params, record);

  // NOTE: client has no updatedByEmail field — the actor is captured on the
  // auditLog row (actorEmail) instead, so no stamp on the record itself.
  await save(record);

  record.__before = before;
};

export const onSuccess = async ({ record, api, session }) => {
  const shopId = record.shopId ?? record.shop?.id;
  if (!shopId) return;

  await writeAudit(api, {
    action: "client.update",
    entityType: "client",
    entityId: record.id,
    shopId,
    actorEmail: session?.get("email") || null,
    before: record.__before || null,
    after: { status: record.status, plan: record.plan },
  });
};

export const options = {
  actionType: "update",
};
