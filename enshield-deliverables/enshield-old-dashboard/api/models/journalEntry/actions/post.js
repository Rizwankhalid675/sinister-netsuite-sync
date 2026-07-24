import { save } from "gadget-server";
import { postJournal } from "../../../lib/finance/ledger.js";
import { journalSnapshot, requireFinanceContext } from "../../../lib/finance/actionContext.js";
import { writeAudit } from "../../../lib/audit.js";
import { claimFinanceOperation, completeFinanceOperation } from "../../../lib/finance/operations.js";

export const run = async ({ record, api, session }) => {
  const { identity, accountingEntityId, period, lines } = await requireFinanceContext({ api, session, record });
  const operation = await claimFinanceOperation(api, {
    journalEntryId: String(record.id),
    accountingEntityId,
    operation: "post",
    actorId: String(identity.user.id),
  });
  if (!operation.claimed) return { idempotent: true, journalEntryId: String(record.id) };
  const result = postJournal({
    entry: journalSnapshot(record, accountingEntityId),
    lines,
    period,
    actorId: String(identity.user.id),
  });
  record.status = result.status;
  record.postedBy = result.postedBy;
  record.postedAt = result.postedAt;
  await save(record);
  await writeAudit(api, {
    shopId: identity.shopId,
    actorEmail: identity.user.email || null,
    action: "finance.journal.post",
    entityType: "journalEntry",
    entityId: record.id,
    before: { status: "approved" },
    after: { status: result.status, accountingEntityId, postedBy: result.postedBy, shadowMode: true },
  });
  await completeFinanceOperation(api, operation.receipt.id, record.id);
};

export const options = { triggers: { api: true }, transactional: true };
