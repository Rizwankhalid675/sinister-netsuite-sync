import { applyParams, save } from "gadget-server";
import { normalizeFinancialEvent, sanitizeFinancialMetadata } from "../../../lib/finance/ledger.js";
import { requireAccountingEntity } from "../../../lib/finance/actionContext.js";
import { PERMISSIONS } from "../../../lib/permissions.js";
import { requireInternalAccess } from "../../../lib/internalAccess.js";
import { writeAudit } from "../../../lib/audit.js";
import { persistFinancialEventOnce } from "../../../lib/finance/operations.js";

export const run = async ({ params, record, api, session }) => {
  const access = await requireInternalAccess({ api, session }, PERMISSIONS.EDIT_FINANCE);
  const identity = { user: access.operator, shopIds: access.shopIds };
  const input = params?.financialEvent || {};
  const accountingEntityId =
    input.accountingEntity?._link ?? input.accountingEntityId;
  const entity = await requireAccountingEntity({ api, shopIds: access.shopIds, accountingEntityId });
  const normalized = normalizeFinancialEvent({
    ...input,
    accountingEntityId: String(accountingEntityId),
  });
  applyParams(
    {
      financialEvent: {
        ...input,
        accountingEntity: { _link: normalized.accountingEntityId },
        sourceVersionKey: normalized.sourceVersionKey,
        currency: normalized.currency,
        amountMinor: normalized.amountMinor,
        metadata: sanitizeFinancialMetadata(input.metadata),
        status: "received",
        recordedBy: String(identity.user.id),
      },
    },
    record
  );
  const persistence = await persistFinancialEventOnce({
    saveRecord: async () => {
      await save(record);
      return record;
    },
    findExisting: () =>
      api.financialEvent.findFirst({
        filter: {
          AND: [
            { sourceVersionKey: { equals: normalized.sourceVersionKey } },
            { accountingEntityId: { equals: normalized.accountingEntityId } },
          ],
        },
        select: {
          id: true,
          sourceVersionKey: true,
          status: true,
          currency: true,
          amountMinor: true,
        },
      }),
  });
  if (!persistence.created) {
    return { idempotent: true, financialEventId: String(persistence.record.id) };
  }
  await writeAudit(api, {
    shopId: entity.shopId,
    actorEmail: identity.user.email || null,
    action: "finance.financialEvent.create",
    entityType: "financialEvent",
    entityId: record.id,
    before: null,
    after: {
      accountingEntityId: normalized.accountingEntityId,
      sourceVersionKey: normalized.sourceVersionKey,
      currency: normalized.currency,
      amountMinor: normalized.amountMinor,
      metadata: sanitizeFinancialMetadata(input.metadata),
    },
  });
  return { idempotent: false, financialEventId: String(record.id) };
};

export const options = { actionType: "create", transactional: true };
