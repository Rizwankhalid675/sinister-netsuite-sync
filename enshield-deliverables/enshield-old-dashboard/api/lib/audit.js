// Shared audit-write helper. Writes one append-only auditLog row.
// Used by claim/client/user/role actions so every mutation is recorded
// through a single code path (consistent action naming + shop scoping).

/**
 * Write an auditLog entry.
 * @param {object} api      - Gadget internal api (from action context).
 * @param {object} opts
 * @param {string} opts.action      - e.g. "claim.transition", "client.update".
 * @param {string} opts.entityType  - model apiIdentifier, e.g. "claim".
 * @param {string} [opts.entityId]  - record id of the affected entity.
 * @param {string} [opts.shopId]    - tenancy; required by auditLog.shop.
 * @param {string} [opts.actorEmail]- who performed the action.
 * @param {object} [opts.before]    - JSON snapshot before the change.
 * @param {object} [opts.after]     - JSON snapshot after the change.
 */
export async function writeAudit(api, opts) {
  const { action, entityType, entityId, shopId, accountingEntityId, actorEmail, before, after } =
    opts || {};
  if (!action || !entityType) {
    throw new Error("writeAudit requires action and entityType");
  }
  if (!shopId) {
    throw new Error("writeAudit requires shopId (auditLog is shop-scoped)");
  }
  return api.internal.auditLog.create({
    action,
    entityType,
    entityId: entityId != null ? String(entityId) : undefined,
    actorEmail: actorEmail || undefined,
    before: before ?? undefined,
    after: after ?? undefined,
    shop: { _link: String(shopId) },
    accountingEntity: accountingEntityId ? { _link: String(accountingEntityId) } : undefined,
  });
}
