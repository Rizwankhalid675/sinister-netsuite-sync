/**
 * ONE-OFF DEV SEED — NOT FOR PRODUCTION USE.
 *
 * Creates a single real, active appUser (Super Admin role, email confirmed,
 * no forced password change) directly in the DEV database, so we can log in
 * through the actual dashboard login form (not the dev-tester bypass button)
 * and verify that authenticated data fetching / API calls actually work.
 *
 * This bypasses appUser.create's normal requireIdentity()/requirePermission()
 * guard on purpose — there is no existing Super Admin in dev yet, so that
 * action can never be called (chicken-and-egg). Runs as a background action
 * so it satisfies requireOwnerProvisioning()-style guards the same way
 * seedDevOperator.js / seedDevSuperAdmin.js do.
 *
 * Delete this file after confirming login works.
 *
 * Usage: call via the Gadget API playground / background action trigger.
 * This action takes NO GraphQL arguments (matching seedDevOperator.js /
 * seedDevSuperAdmin.js) — email/name/password are fixed constants below so
 * it works as a plain `mutation { seedDevAppUser { success } }` call. The
 * generated password is only ever returned in the mutation result / logged,
 * never persisted in plaintext.
 */
import { generateTempPassword } from "../lib/authPassword.js";
import { withAppUserSeedEscape } from "../lib/operatorProvisioning.js";

const DEV_APP_USER_EMAIL = "dev@enshield.local";
const DEV_APP_USER_NAME = "Dev Tester";

export const run = async ({ api, logger }) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seedDevAppUser must never run in production");
  }

  const email = DEV_APP_USER_EMAIL;
  const name = DEV_APP_USER_NAME;
  const plaintextPassword = generateTempPassword();
  if (plaintextPassword.length < 8) {
    throw new Error("password must be at least 8 characters");
  }

  const shop = await api.shopifyShop.findFirst({ select: { id: true, domain: true } });
  if (!shop) {
    throw new Error("No shopifyShop record found in this environment; cannot link appUser to a shop.");
  }

  const superAdminRole = await api.appRole.findFirst({
    filter: { name: { equals: "Super Admin" } },
    select: { id: true, name: true },
  });
  if (!superAdminRole) {
    throw new Error('appRole "Super Admin" not found. Run seedAppRoles first.');
  }

  const existing = await api.appUser.maybeFindFirst({
    filter: { email: { equals: email } },
    select: { id: true, email: true, status: true },
  });
  if (existing) {
    logger.info({ id: existing.id }, "appUser with this email already exists; skipping create");
    return {
      success: true,
      skipped: true,
      id: existing.id,
      email: existing.email,
      note: "User already existed. If you don't know its password, delete it in the data browser and re-run this seed.",
    };
  }

  // personId/shopPersonKey are minted server-side inside appUser/create.js
  // itself (and rejected if supplied directly), so we don't pre-generate
  // them here — we only need to supply shop/role/name/email/password and
  // let that action's own logic do the rest, same as any other caller.
  const record = await withAppUserSeedEscape(() =>
    api.appUser.create({
      name,
      email,
      password: plaintextPassword,
      shop: { _link: String(shop.id) },
      role: { _link: String(superAdminRole.id) },
      status: "active",
      emailConfirmed: true,
      mustChangePassword: false,
      accessScope: "all_stores",
      department: "administration",
    })
  );

  logger.info({ id: record.id, email: record.email, shopDomain: shop.domain }, "Seeded dev appUser");

  // Plaintext password is intentionally returned ONLY here (never persisted).
  return {
    success: true,
    skipped: false,
    id: record.id,
    email: record.email,
    shopDomain: shop.domain,
    password: plaintextPassword,
    note: "Use this email/password to log in via the real dashboard login form on the dev environment.",
  };
};

export const options = {
  // Callable directly via the API/playground. appUser.create's normal
  // requireIdentity/requirePermission(MANAGE_USERS) guard is bypassed here
  // on purpose since this is bootstrapping the first user. Delete this file
  // once a real Super Admin appUser exists in dev and login is confirmed.
  triggers: { api: true },
};
