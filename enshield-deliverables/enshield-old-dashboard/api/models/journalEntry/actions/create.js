import { applyParams, save } from "gadget-server";
import { assertShadowMode, buildSourceVersionKey, normalizeCurrency } from "../../../lib/finance/ledger.js";
import { requireFinanceContext } from "../../../lib/finance/actionContext.js";
import { writeAudit } from "../../../lib/audit.js";
import { persistJournalEntryOnce } from "../../../lib/finance/operations.js";

export const run = async ({ params, record, api, session }) => {
  const input = params?.journalEntry || {};
  const accountingEntityId =
    input.accountingEntity?._link ?? input.accountingEntityId;
  const sourceSystem = String(input.sourceSystem || "").trim();
  const sourceId = String(input.sourceId || "").trim();
  const sourceVersion = String(input.sourceVersion || "").trim();
  applyParams(
    {
      journalEntry: {
        ...input,
        currency: normalizeCurrency(input.currency),
        sourceSystem,
        sourceId,
        sourceVersion,
        sourceVersionKey: buildSourceVersionKey({
          accountingEntityId: String(accountingEntityId),
          sourceSystem,
          sourceId,
          sourceVersion,
        }),
        status: "draft",
        shadowMode: true,
      },
    },
    record
  );
  assertShadowMode(record.shadowMode);
  const { identity } = await requireFinanceContext({
    api,
    session,
    record,
    includeLines: false,
  });
  record.preparedBy = String(identity.user.id);
  record.preparedAt = new Date().toISOString();
  const expected = {
    sourceVersionKey: record.sourceVersionKey,
    accountingEntityId: String(accountingEntityId),
    accountingPeriodId:
      record.accountingPeriodId ?? record.accountingPeriod?.id ??
      record.accountingPeriod?._link,
    currency: record.currency,
    sourceSystem,
    sourceId,
    sourceVersion,
    financialEventId:
      record.financialEventId ?? record.financialEvent?.id ??
      record.financialEvent?._link ?? "",
    shadowMode: true,
  };
  const persistence = await persistJournalEntryOnce({
    saveRecord: async () => {
      await save(record);
      return record;
    },
    findExisting: () =>
      api.journalEntry.findFirst({
        filter: {
          AND: [
            { sourceVersionKey: { equals: record.sourceVersionKey } },
            { accountingEntityId: { equals: String(accountingEntityId) } },
          ],
        },
        select: {
          id: true,
          sourceVersionKey: true,
          accountingEntityId: true,
          accountingPeriodId: true,
          currency: true,
          sourceSystem: true,
          sourceId: true,
          sourceVersion: true,
          financialEventId: true,
          shadowMode: true,
          status: true,
        },
      }),
    expected,
  });
  if (!persistence.created) {
    return {
      idempotent: true,
      journalEntryId: String(persistence.record.id),
      status: persistence.record.status,
      shadowMode: true,
    };
  }
  await writeAudit(api, {
    shopId: identity.shopId,
    actorEmail: identity.user.email || null,
    action: input.reversalKey ? "finance.journal.reverse" : "finance.journal.create",
    entityType: "journalEntry",
    entityId: record.id,
    before: null,
    after: {
      accountingEntityId: String(accountingEntityId),
      status: "draft",
      currency: record.currency,
      sourceVersionKey: record.sourceVersionKey,
      shadowMode: true,
      ...(input.reversalKey
        ? { reversesJournalEntryId: input.reversesJournalEntry?._link }
        : {}),
    },
  });
  return {
    idempotent: false,
    journalEntryId: String(record.id),
    status: record.status,
    shadowMode: true,
  };
};

export const options = { actionType: "create", transactional: true };
