import { applyParams, save } from "gadget-server";
import { assertLegalTransition } from "../../../lib/claimStateMachine.js";
import { writeAudit } from "../../../lib/audit.js";
import { persistClaimMutation } from "../../../lib/claimMutation.js";
import {
  requiredPermissionsForClaimUpdate,
  relationId,
  validateClaimRelationships,
  validateMinorCurrencyPair,
} from "../../../lib/claimPolicy.js";
import {
  PERMISSIONS,
  requireIdentity,
  requirePermission,
} from "../../../lib/permissions.js";

/**
 * Update a claim. If the status changes, the transition is validated against
 * the state machine (assertLegalTransition throws on illegal moves) and a
 * claimEvent row is written recording who/when/from/to. Every update stamps
 * updatedByEmail and records an audit entry.
 */
export const run = async ({ params, record, logger, api, session }) => {
  // Capture the pre-change status BEFORE applyParams overwrites it.
  const fromStatus = record.status;
  const originalShopId = relationId(record, "shop");
  const input = params?.claim || {};
  const requiredPermissions = requiredPermissionsForClaimUpdate(
    input,
    fromStatus,
    PERMISSIONS.EDIT_CLAIMS
  );
  const toStatus = input.status ?? fromStatus;
  const statusChanged = toStatus !== fromStatus;
  if (statusChanged) {
    assertLegalTransition(fromStatus, toStatus);
  }
  for (const permission of requiredPermissions) {
    await requirePermission({ api, session }, permission);
  }
  const identity = await requireIdentity({ api, session });

  const modelInput = Object.fromEntries(
    Object.entries(input).filter(([key]) => key !== "transitionNote")
  );
  if ("claimValueMinor" in modelInput || "claimCurrency" in modelInput) {
    const money = validateMinorCurrencyPair(
      modelInput.claimValueMinor ?? record.claimValueMinor,
      modelInput.claimCurrency ?? record.claimCurrency,
      "claim"
    );
    modelInput.claimValueMinor = money.amountMinor;
    modelInput.claimCurrency = money.currency;
  }
  applyParams({ claim: modelInput }, record);

  const recordShopId = relationId(record, "shop");
  if (
    String(originalShopId) !== String(identity.shopId) ||
    String(recordShopId) !== String(identity.shopId)
  ) {
    const error = new Error("Forbidden: claim shop does not match session shop");
    error.statusCode = 403;
    throw error;
  }
  await validateClaimRelationships({
    api,
    shopId: identity.shopId,
    clientId: relationId(record, "client"),
    orderId: relationId(record, "order"),
  });

  const actorEmail = identity.user?.email || null;
  record.__actorEmail = actorEmail;
  if (actorEmail) {
    record.updatedByEmail = actorEmail;
  }

  await persistClaimMutation({
    saveRecord: () => save(record),
    createEvent: statusChanged
      ? () =>
          api.internal.claimEvent.create({
            claim: { _link: String(record.id) },
            shop: { _link: String(identity.shopId) },
            fromStatus: fromStatus || null,
            toStatus,
            actorEmail: actorEmail || null,
            note: input.transitionNote || null,
          })
      : null,
    createAudit: () =>
      writeAudit(api, {
        action: statusChanged ? "claim.transition" : "claim.update",
        entityType: "claim",
        entityId: record.id,
        shopId: identity.shopId,
        actorEmail: record.__actorEmail || null,
        before: { status: fromStatus },
        after: {
          status: record.status,
          claimValueMinor: record.claimValueMinor,
          claimCurrency: record.claimCurrency,
        },
      }),
  });
};

export const options = {
  actionType: "update",
  transactional: true,
};
