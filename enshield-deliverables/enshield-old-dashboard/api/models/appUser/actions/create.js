import { applyParams, save } from "gadget-server";
import { writeAudit } from "../../../lib/audit.js";
import {
  buildShopPersonKey,
  normalizePersonId,
  roleLinkId,
  validateAppUserCreateInput,
  validateCanonicalRole,
} from "../../../lib/appUserPolicy.js";
import {
  PERMISSIONS,
  requireIdentity,
  requirePermission,
} from "../../../lib/permissions.js";

/**
 * Create an admin user. email/name/role/shop are required by the schema.
 * New users start "invited" (schema default). Stamps createdByEmail and audits.
 */
export const run = async ({ params, record, logger, api, session }) => {
  const input = params?.appUser || {};
  validateAppUserCreateInput(input);
  await requirePermission({ api, session }, PERMISSIONS.MANAGE_USERS);
  const identity = await requireIdentity({ api, session });
  const personId = normalizePersonId(input.personId);
  const shopPersonKey = buildShopPersonKey(identity.shopId, personId);
  const requestedRoleId = roleLinkId(input.role);
  const role = await api.appRole.findFirst({
    filter: { id: { equals: requestedRoleId } },
    select: { id: true, name: true },
  });
  validateCanonicalRole(role, requestedRoleId);
  const duplicates = await api.appUser.findMany({
    filter: {
      AND: [
        { shopPersonKey: { equals: shopPersonKey } },
        { shopId: { equals: identity.shopId } },
      ],
    },
    first: 1,
    select: { id: true },
  });
  if (duplicates.length > 0) {
    const error = new Error("Duplicate appUser membership");
    error.statusCode = 409;
    throw error;
  }

  applyParams(
    {
      appUser: {
        ...input,
        personId,
        shopPersonKey,
        shop: { _link: String(identity.shopId) },
        role: { _link: String(requestedRoleId) },
      },
    },
    record
  );

  const actorEmail = identity.user.email || null;
  if (actorEmail) {
    record.createdByEmail = actorEmail;
  }

  await save(record);
  record.__actorEmail = actorEmail;
};

export const onSuccess = async ({ record, api, session }) => {
  const shopId = record.shopId ?? record.shop?.id;
  if (!shopId) return;

  await writeAudit(api, {
    action: "appUser.create",
    entityType: "appUser",
    entityId: record.id,
    shopId,
    actorEmail: record.__actorEmail || null,
    before: null,
    after: { email: record.email, status: record.status, roleId: record.roleId },
  });
};

export const options = {
  actionType: "create",
};
