/** Development-only bootstrap for the first dashboard administrator. */
import { buildShopPersonKey, generatePersonId } from "../lib/appUserPolicy.js";
import { generateTempPassword, hashPassword } from "../lib/authPassword.js";

const DEV_APP_USER_EMAIL = "r.khalid@sinisterdiesel.com";
const DEV_APP_USER_NAME = "Development Administrator";

export const run = async ({ api, logger }) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seedDevAppUser must never run in production");
  }

  const existing = await api.appUser.maybeFindFirst({
    filter: { email: { equals: DEV_APP_USER_EMAIL } },
    select: { id: true, email: true, status: true },
  });
  if (existing) {
    return {
      success: true,
      skipped: true,
      id: existing.id,
      email: existing.email,
      note: "User already exists.",
    };
  }

  const shop = await api.shopifyShop.findFirst({ select: { id: true } });
  if (!shop) throw new Error("No Shopify shop is available for the development user");

  const role = await api.appRole.findFirst({
    filter: { name: { equals: "Super Admin" } },
    select: { id: true },
  });
  if (!role) throw new Error('App role "Super Admin" is not available');

  const password = generateTempPassword();
  const personId = generatePersonId();
  const record = await api.internal.appUser.create({
    name: DEV_APP_USER_NAME,
    email: DEV_APP_USER_EMAIL,
    personId,
    shopPersonKey: buildShopPersonKey(shop.id, personId),
    passwordHash: await hashPassword(password),
    shop: { _link: String(shop.id) },
    role: { _link: String(role.id) },
    status: "active",
    emailConfirmed: true,
    mustChangePassword: false,
    accessScope: "all_stores",
    allowedShopIds: [],
    department: "administration",
  });

  logger.info({ id: record.id }, "Seeded development appUser");
  return {
    success: true,
    skipped: false,
    id: record.id,
    email: record.email,
    password,
    note: "Store this temporary development password securely.",
  };
};

export const options = { triggers: { api: true } };
