import { applyParams, save } from "gadget-server";
import { writeAudit } from "../../../lib/audit.js";
import { PERMISSIONS, requirePermission } from "../../../lib/permissions.js";

/**
 * Update an admin role. The 10 roles are seeded globals fixed by the name enum
 * (acceptUnlistedOptions: false), so there is deliberately NO create or delete
 * action — a role can't be invented and deleting one would orphan every
 * appUser that belongs to it. The only legitimate edit is retuning a role's
 * permissions JSON or description (a Super Admin adjusting grants).
 *
 * appRole is a global definition, but every audit entry is scoped to the
 * authenticated shop that performed the change.
 */
export const run = async ({ params, record, logger, api, session }) => {
  await requirePermission({ api, session }, PERMISSIONS.MANAGE_SETTINGS);
  record.__before = {
    description: record.description,
    permissions: record.permissions,
  };

  applyParams(params, record);

  // Guard: name is enum + unique + required; applyParams can't invent a value,
  // but defend against a null being written over a seeded role's name.
  if (!record.name) {
    throw new Error("appRole.name is required and cannot be cleared");
  }

  await save(record);
};

export const onSuccess = async ({ record, api, session }) => {
  const shopId = session?.get("shopId");
  if (!shopId) {
    throw new Error("Cannot audit appRole.update without an authenticated shop");
  }

  await writeAudit(api, {
    action: "appRole.update",
    entityType: "appRole",
    entityId: record.id,
    shopId,
    actorEmail: session?.get("email") || null,
    before: record.__before || null,
    after: { description: record.description, permissions: record.permissions },
  });
};

export const options = {
  actionType: "update",
};
