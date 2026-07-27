import { applyParams, save } from "gadget-server";
import { writeAudit } from "../../../lib/audit.js";
import {
  buildShopPersonKey,
  generatePersonId,
  roleLinkId,
  validateAppUserCreateInput,
  validateCanonicalRole,
} from "../../../lib/appUserPolicy.js";
import {
  PERMISSIONS,
  requireIdentity,
  requirePermission,
} from "../../../lib/permissions.js";
import { isAppUserSeedInProgress } from "../../../lib/operatorProvisioning.js";
import {
  expiryFromNow,
  generateTempPassword,
  generateToken,
  hashPassword,
  hashToken,
  TOKEN_TTL_MS,
} from "../../../lib/authPassword.js";
import { sendWelcomeEmail } from "../../../lib/mailer.js";

/**
 * Create an admin user. email/name/role/shop are required by the schema.
 * personId is ALWAYS minted server-side (never accepted from the caller) so
 * the Super Admin never has to supply/track it manually. A temp password and
 * an email confirmation token are generated, hashed for storage, and the
 * plaintext values are emailed to the new user. New users start "invited"
 * (schema default) and must confirm their email + change their password on
 * first login (mustChangePassword defaults to true).
 */
export const run = async ({ params, record, logger, api, session }) => {
  const input = params?.appUser || {};
  validateAppUserCreateInput(input);

  // DEV/INIT-ONLY ESCAPE: the very first appUser (Super Admin) can never be
  // created via the normal identity-gated path below, since no appUser
  // identity exists yet to satisfy requireIdentity()/requirePermission()
  // (chicken-and-egg). api/actions/seedDevAppUser.js wraps its single nested
  // api.appUser.create() call in withAppUserSeedEscape() to flip this flag
  // for the duration of that call only. Never true in production.
  const seedEscape = isAppUserSeedInProgress();

  let identityShopId;
  let actorEmail = null;
  if (seedEscape) {
    // Caller (seedDevAppUser.js) must supply shop directly since there is no
    // session-derived identity to source it from.
    identityShopId = input.shop?._link ?? input.shopId;
    if (!identityShopId) {
      const error = new Error("shop is required when using the dev seed escape");
      error.statusCode = 400;
      throw error;
    }
  } else {
    await requirePermission({ api, session }, PERMISSIONS.MANAGE_USERS);
    const identity = await requireIdentity({ api, session });
    identityShopId = identity.shopId;
    actorEmail = identity.user.email || null;
  }

  // Reject duplicate emails within the shop before doing any further work.
  const emailCandidates = await api.appUser.findMany({
    filter: {
      AND: [
        { shopPersonKey: { startsWith: `${identityShopId}:` } },
        { email: { equals: input.email } },
      ],
    },
    select: { id: true },
    first: 1,
  });
  if (emailCandidates.length > 0) {
    const error = new Error("A user with this email already exists");
    error.statusCode = 409;
    throw error;
  }

  // Server-generated, collision-checked personId — caller cannot set this.
  let personId;
  let shopPersonKey;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generatePersonId();
    const candidateKey = buildShopPersonKey(identityShopId, candidate);
    const existing = await api.appUser.findFirst({
      filter: {
        AND: [
          { shopPersonKey: { equals: candidateKey } },
          { shopId: { equals: identityShopId } },
        ],
      },
      select: { id: true },
    });
    if (!existing) {
      personId = candidate;
      shopPersonKey = candidateKey;
      break;
    }
  }
  if (!personId) {
    const error = new Error("Failed to generate a unique personId, please retry");
    error.statusCode = 500;
    throw error;
  }

  const requestedRoleId = roleLinkId(input.role);
  const role = await api.appRole.findFirst({
    filter: { id: { equals: requestedRoleId } },
    select: { id: true, name: true },
  });
  validateCanonicalRole(role, requestedRoleId);

  // Mint temp password + email confirmation token; only hashes are persisted.
  const tempPassword = generateTempPassword();
  const passwordHash = await hashPassword(tempPassword);
  const confirmToken = generateToken();
  const confirmTokenHash = await hashToken(confirmToken);

  applyParams(
    {
      appUser: {
        ...input,
        personId,
        shopPersonKey,
        shop: { _link: String(identityShopId) },
        role: { _link: String(requestedRoleId) },
        passwordHash,
        mustChangePassword: true,
        emailConfirmed: false,
        emailConfirmationToken: confirmTokenHash,
        emailConfirmationExpiresAt: expiryFromNow(TOKEN_TTL_MS.emailConfirmation),
      },
    },
    record
  );

  if (actorEmail) {
    record.createdByEmail = actorEmail;
  }

  await save(record);
  record.__actorEmail = actorEmail;
  record.__tempPassword = tempPassword;
  record.__confirmToken = confirmToken;
};

export const onSuccess = async ({ record, api, session, logger }) => {
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

  try {
    await sendWelcomeEmail({
      to: record.email,
      name: record.name,
      tempPassword: record.__tempPassword,
      confirmToken: record.__confirmToken,
    });
  } catch (err) {
    logger?.error?.({ err, appUserId: record.id }, "Failed to send welcome email");
  }
};

export const options = {
  actionType: "create",
};
