import { save } from "gadget-server";
import { submitJournal } from "../../../lib/finance/ledger.js";
import { journalSnapshot, requireFinanceContext } from "../../../lib/finance/actionContext.js";
import { writeAudit } from "../../../lib/audit.js";
import { claimFinanceOperation, completeFinanceOperation } from "../../../lib/finance/operations.js";

export const run = async ({ record, api, session }) => {
  const { identity, accountingEntityId, lines } = await requireFinanceContext({ api, session, record });
  const operation = await claimFinanceOperation(api, {
    journalEntryId: String(record.id),
    accountingEntityId,
    operation: "submit",
    actorId: String(identity.user.id),
  });
  if (!operation.claimed) return { idempotent: true, journalEntryId: String(record.id) };
  const result = submitJournal({
    entry: journalSnapshot(record, accountingEntityId),
    lines,
  });
  record.status = result.status;
  await save(record);
  await writeAudit(api, {
    shopId: identity.shopId,
    actorEmail: identity.user.email || null,
    action: "finance.journal.submit",
    entityType: "journalEntry",
    entityId: record.id,
    before: { status: "draft" },
    after: { status: result.status, accountingEntityId, shadowMode: true },
  });
  await completeFinanceOperation(api, operation.receipt.id, record.id);
};

export const options = { triggers: { api: true }, transactional: true };
