import { applyParams, save } from "gadget-server";
import { writeAudit } from "../../../lib/audit.js";
import {
  roleLinkId,
  validateAppUserUpdateInput,
  validateCanonicalRole,
} from "../../../lib/appUserPolicy.js";
import {
  PERMISSIONS,
  requireIdentity,
  requirePermission,
} from "../../../lib/permissions.js";

/**
 * Update an admin user. Captures a before-snapshot for audit, stamps
 * updatedByEmail. Status transitions (invited -> active -> deactivated)
 * are recorded but not enforced here — soft-deactivation is via delete.js.
 */
export const run = async ({ params, record, logger, api, session }) => {
  const input = params?.appUser || {};
  validateAppUserUpdateInput(input);
  await requirePermission({ api, session }, PERMISSIONS.MANAGE_USERS);
  const identity = await requireIdentity({ api, session });
  if (String(record.shopId ?? record.shop?.id) !== String(identity.shopId)) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }
  const requestedRoleId = roleLinkId(input.role);
  if (input.role) {
    const role = await api.appRole.findFirst({
      filter: { id: { equals: requestedRoleId } },
      select: { id: true, name: true },
    });
    validateCanonicalRole(role, requestedRoleId);
  }
  record._before = {
    email: record.email,
    name: record.name,
    roleId: record.roleId,
    status: record.status,
  };

  applyParams({ appUser: input }, record);

  const actorEmail = identity.user.email || null;
  if (actorEmail) {
    record.updatedByEmail = actorEmail;
  }

  await save(record);
  record.__actorEmail = actorEmail;
};

export const onSuccess = async ({ record, api, session }) => {
  const shopId = record.shopId ?? record.shop?.id;
  if (!shopId) return;

  await writeAudit(api, {
    action: "appUser.update",
    entityType: "appUser",
    entityId: record.id,
    shopId,
    actorEmail: record.__actorEmail || null,
    before: record._before ?? null,
    after: { email: record.email, name: record.name, roleId: record.roleId, status: record.status },
  });
};

export const options = {
  actionType: "update",
};
