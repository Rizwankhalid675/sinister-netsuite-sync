import { applyParams, save } from "gadget-server";
import { normalizeCurrency } from "../../../lib/finance/ledger.js";
import { deriveAccountKey } from "../../../lib/finance/operations.js";
import { requireAccountingEntity } from "../../../lib/finance/actionContext.js";
import { PERMISSIONS } from "../../../lib/permissions.js";
import { requireInternalAccess } from "../../../lib/internalAccess.js";
import { writeAudit } from "../../../lib/audit.js";

export const run = async ({ params, record, api, session }) => {
  const access = await requireInternalAccess({ api, session }, PERMISSIONS.EDIT_FINANCE);
  const identity = { user: access.operator };
  const input = params?.ledgerAccount || {};
  const accountingEntityId = input.accountingEntity?._link ?? input.accountingEntityId;
  const entity = await requireAccountingEntity({ api, shopIds: access.shopIds, accountingEntityId });
  const code = String(input.code || "").trim();
  applyParams({
    ledgerAccount: {
      ...input,
      accountingEntity: { _link: String(accountingEntityId) },
      accountKey: deriveAccountKey(String(accountingEntityId), code),
      code,
      currency: normalizeCurrency(input.currency),
      status: "active",
      createdBy: String(identity.user.id),
      updatedBy: String(identity.user.id),
    },
  }, record);
  await save(record);
  await writeAudit(api, {
    shopId: entity.shopId,
    actorEmail: identity.user.email || null,
    action: "finance.ledgerAccount.create",
    entityType: "ledgerAccount",
    entityId: record.id,
    before: null,
    after: { accountingEntityId: String(accountingEntityId), code, currency: record.currency },
  });
};

export const options = { actionType: "create", transactional: true };
