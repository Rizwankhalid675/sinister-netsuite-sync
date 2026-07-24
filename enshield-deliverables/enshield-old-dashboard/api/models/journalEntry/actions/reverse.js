import { assertPeriodOpen, createReversalDraft } from "../../../lib/finance/ledger.js";
import { journalSnapshot, requireFinanceContext } from "../../../lib/finance/actionContext.js";
import {
  claimFinanceOperation,
  completeFinanceOperation,
  deriveReversalKey,
} from "../../../lib/finance/operations.js";

export const run = async ({ params, record, api, session }) => {
  const { identity, accountingEntityId, lines } = await requireFinanceContext({ api, session, record });
  const operation = await claimFinanceOperation(api, {
    journalEntryId: String(record.id),
    accountingEntityId,
    operation: "reverse",
    actorId: String(identity.user.id),
  });
  if (!operation.claimed) {
    return {
      idempotent: true,
      journalEntryId: operation.receipt.resultJournalEntryId || null,
    };
  }
  const reversalKey = deriveReversalKey(String(record.id));
  const draft = createReversalDraft(
    { ...journalSnapshot(record, accountingEntityId), lines },
    {
      sourceVersionKey: reversalKey,
      actorId: String(identity.user.id),
    }
  );
  const targetPeriod = await api.accountingPeriod.findFirst({
    filter: {
      AND: [
        { id: { equals: params?.accountingPeriodId } },
        { accountingEntityId: { equals: accountingEntityId } },
      ],
    },
    select: { id: true, accountingEntityId: true, status: true },
  });
  if (!targetPeriod) throw new Error("reversal accounting period mismatch");
  assertPeriodOpen(targetPeriod);
  const reversal = await api.internal.journalEntry.create({
    sourceVersionKey: draft.sourceVersionKey,
    sourceSystem: "journal",
    sourceId: String(record.id),
    sourceVersion: "reversal-1",
    reversalKey,
    accountingEntity: { _link: draft.accountingEntityId },
    accountingPeriod: { _link: params?.accountingPeriodId },
    currency: draft.currency,
    status: "draft",
    shadowMode: true,
    preparedBy: draft.preparedById,
    preparedAt: new Date().toISOString(),
    reversesJournalEntry: { _link: draft.reversesJournalEntryId },
  });
  const reversalId = reversal.journalEntryId || reversal.id;
  for (const [index, line] of draft.lines.entries()) {
    await api.internal.journalLine.create({
      accountingEntity: { _link: draft.accountingEntityId },
      journalEntry: { _link: reversalId },
      ledgerAccount: { _link: line.ledgerAccountId },
      sequence: index + 1,
      currency: line.currency,
      debitMinor: line.debitMinor,
      creditMinor: line.creditMinor,
      createdBy: String(identity.user.id),
    });
  }
  await completeFinanceOperation(api, operation.receipt.id, reversalId);
  return { idempotent: false, journalEntryId: String(reversalId) };
};

export const options = { triggers: { api: true }, transactional: true };
