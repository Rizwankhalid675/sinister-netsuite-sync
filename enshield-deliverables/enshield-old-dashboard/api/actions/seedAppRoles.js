/**
 * ONE-OFF DEV/INIT SEED.
 *
 * Creates (or updates) the 9 standard appRole records from the single
 * source of truth in api/lib/permissions.js (ROLE_GRANTS). Idempotent —
 * safe to run multiple times; existing roles get their permissions synced.
 *
 * Required before seedDevSuperAdmin (or any operatorShopAssignment grant)
 * can link to an appRole.
 */
import { ROLE_GRANTS, ROLE_NAMES, grantsForRole } from "../lib/permissions.js";
import { withAppRoleSeedEscape } from "../lib/operatorProvisioning.js";

export const run = async ({ api, logger }) => {
  const results = [];

  for (const name of ROLE_NAMES) {
    const permissions = grantsForRole(name);
    const existing = await api.appRole.maybeFindFirst({
      filter: { name: { equals: name } },
      select: { id: true, name: true, permissions: true },
    });

    if (existing) {
      await api.appRole.update(existing.id, { permissions });
      results.push({ name, action: "updated" });
      continue;
    }

    await withAppRoleSeedEscape(() =>
      api.appRole.create({
        name,
        description: `${name} role for the Enshield internal dashboard.`,
        permissions,
      })
    );
    results.push({ name, action: "created" });
  }

  logger.info({ results }, "Seeded appRoles");
  return { success: true, roles: results, totalRoleGrants: Object.keys(ROLE_GRANTS).length };
};

export const options = {
  triggers: { api: true },
};
