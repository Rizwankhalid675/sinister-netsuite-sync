import { applyParams, save } from "gadget-server";
import { assertImmutablePostedUpdate, assertShadowMode } from "../../../lib/finance/ledger.js";
import { requireFinanceContext } from "../../../lib/finance/actionContext.js";
import { writeAudit } from "../../../lib/audit.js";

export const run = async ({ params, record, api, session }) => {
  const { identity, accountingEntityId } = await requireFinanceContext({ api, session, record, includeLines: false });
  const input = params?.journalEntry || {};
  assertImmutablePostedUpdate(record, input);
  if (record.status !== "draft") {
    throw new Error("only draft journal metadata can be edited");
  }
  const forbidden = Object.keys(input).filter((key) => key !== "memo");
  if (forbidden.length) {
    throw new Error("journal accounting fields are immutable after creation");
  }
  applyParams({ journalEntry: { memo: input.memo } }, record);
  assertShadowMode(record.shadowMode);
  await save(record);
  await writeAudit(api, {
    shopId: identity.shopId,
    actorEmail: identity.user.email || null,
    action: "finance.journal.update",
    entityType: "journalEntry",
    entityId: record.id,
    before: { status: "draft" },
    after: { accountingEntityId, status: "draft", memoChanged: true, shadowMode: true },
  });
};

export const options = { actionType: "update", transactional: true };
