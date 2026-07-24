import { applyParams, save } from "gadget-server";
import { requireAppRoleSeedEscape } from "../../../lib/operatorProvisioning.js";

/**
 * Create an admin role — INTENTIONALLY LOCKED DOWN.
 *
 * appRole names are a fixed 9-value enum (acceptUnlistedOptions: false) and
 * every appUser/operatorShopAssignment that references a role depends on it
 * continuing to exist. Inventing arbitrary new roles at runtime, or letting
 * any authenticated caller create roles, would break that guarantee. So this
 * action is NOT exposed generally — it only ever runs from within
 * api/actions/seedAppRoles.js's dev/init bootstrap, guarded by the same
 * narrow escape-hatch pattern used for internalOperator/operatorShopAssignment
 * dev seeding (see api/lib/operatorProvisioning.js).
 *
 * There is still no delete action, and this file does not add one — deleting
 * a role would orphan any appUser or operatorShopAssignment pointing at it.
 */
export const run = async ({ params, record, api, session }) => {
  requireAppRoleSeedEscape();

  applyParams(params, record);

  if (!record.name) {
    throw new Error("appRole.name is required and cannot be cleared");
  }
  if (!record.permissions) {
    throw new Error("appRole.permissions is required");
  }

  await save(record);
};

export const options = {
  actionType: "create",
};
