/**
 * ONE-OFF DEV SEED — NOT FOR PRODUCTION USE.
 *
 * Grants the "dev-tester-1" internalOperator a Super Admin
 * operatorShopAssignment for every shop currently installed, so the local/dev
 * environment can exercise the full dashboard (all nav sections, all
 * permissions) while signed in via the internal-login dev bypass.
 *
 * Runs as a background action so it legitimately satisfies
 * requireOwnerProvisioning() rather than weakening it (same pattern as
 * seedDevOperator.js).
 *
 * Delete this file after running it once.
 */
import { withDevSeedEscape, assignmentKeyFor } from "../lib/operatorProvisioning.js";

export const run = async ({ api, logger }) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seedDevSuperAdmin must never run in production");
  }

  const operator = await api.internalOperator.findFirst({
    filter: { AND: [{ personId: { equals: "dev-tester-1" } }, { status: { equals: "active" } }] },
    select: { id: true, personId: true },
  });
  if (!operator) {
    throw new Error("No active dev-tester-1 internalOperator found. Run seedDevOperator first.");
  }

  const superAdminRole = await api.appRole.findFirst({
    filter: { name: { equals: "Super Admin" } },
    select: { id: true, name: true },
  });
  if (!superAdminRole) {
    throw new Error('appRole "Super Admin" not found. Seed appRoles first.');
  }

  const shops = await api.shopifyShop.findMany({ select: { id: true, domain: true } });
  if (!shops.length) {
    logger.warn("No shopifyShop records found; nothing to assign.");
    return { success: true, operatorId: operator.id, roleId: superAdminRole.id, assignments: [] };
  }

  const results = [];
  for (const shop of shops) {
    const assignmentKey = assignmentKeyFor(operator.id, shop.id);
    const existing = await api.operatorShopAssignment.maybeFindFirst({
      filter: { assignmentKey: { equals: assignmentKey } },
      select: { id: true, role: { id: true, name: true }, status: true },
    });

    if (existing) {
      if (existing.role?.id !== superAdminRole.id || existing.status !== "active") {
        await withDevSeedEscape(() =>
          api.operatorShopAssignment.update(existing.id, {
            role: { _link: superAdminRole.id },
            status: "active",
          })
        );
        results.push({ shopId: shop.id, domain: shop.domain, action: "updated" });
      } else {
        results.push({ shopId: shop.id, domain: shop.domain, action: "skipped" });
      }
      continue;
    }

    await withDevSeedEscape(() =>
      api.operatorShopAssignment.create({
        assignmentKey,
        operator: { _link: operator.id },
        shop: { _link: shop.id },
        role: { _link: superAdminRole.id },
        status: "active",
        createdByPersonId: "dev-tester-1",
      })
    );
    results.push({ shopId: shop.id, domain: shop.domain, action: "created" });
  }

  logger.info({ operatorId: operator.id, roleId: superAdminRole.id, results }, "Granted Super Admin to dev-tester-1");
  return { success: true, operatorId: operator.id, roleId: superAdminRole.id, assignments: results };
};

export const options = {
  // Callable directly via the API/playground. operatorShopAssignment.create's
  // requireOwnerProvisioning() guard has a narrow dev-only exception
  // (see api/lib/operatorProvisioning.js's withDevSeedEscape) so this
  // one-off seed can run without pre-existing provisioning. Delete this
  // file after use.
  triggers: { api: true },
};
