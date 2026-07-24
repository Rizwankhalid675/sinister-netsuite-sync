import { applyParams, save } from "gadget-server";
import { assertMinorUnits, normalizeCurrency } from "../../../lib/finance/ledger.js";
import { deriveJournalLineKey } from "../../../lib/finance/operations.js";
import { PERMISSIONS } from "../../../lib/permissions.js";
import { requireInternalAccess } from "../../../lib/internalAccess.js";
import { requireAccountingEntity } from "../../../lib/finance/actionContext.js";
import { writeAudit } from "../../../lib/audit.js";

export const run = async ({ params, record, api, session }) => {
  const access = await requireInternalAccess({ api, session }, PERMISSIONS.EDIT_FINANCE);
  const identity = { user: access.operator };
  const input = params?.journalLine || {};
  const accountingEntityId = input.accountingEntity?._link ?? input.accountingEntityId;
  const journalEntryId = input.journalEntry?._link ?? input.journalEntryId;
  const ledgerAccountId = input.ledgerAccount?._link ?? input.ledgerAccountId;
  const entity = await requireAccountingEntity({ api, shopIds: access.shopIds, accountingEntityId });
  const entry = await api.journalEntry.findFirst({
    filter: { AND: [
      { id: { equals: journalEntryId } },
      { accountingEntityId: { equals: accountingEntityId } },
      { status: { equals: "draft" } },
    ] },
    select: { id: true, accountingEntityId: true, currency: true, status: true },
  });
  const account = await api.ledgerAccount.findFirst({
    filter: { AND: [
      { id: { equals: ledgerAccountId } },
      { accountingEntityId: { equals: accountingEntityId } },
    ] },
    select: { id: true, accountingEntityId: true, currency: true, status: true },
  });
  const currency = normalizeCurrency(input.currency);
  if (!entry || !account || account.status !== "active" ||
      entry.currency !== currency || account.currency !== currency) {
    throw new Error("journal line relationships must be active, same-entity, and same-currency");
  }
  const debitMinor = assertMinorUnits(input.debitMinor ?? 0, "debitMinor");
  const creditMinor = assertMinorUnits(input.creditMinor ?? 0, "creditMinor");
  if (!((debitMinor > 0 && creditMinor === 0) || (creditMinor > 0 && debitMinor === 0))) {
    throw new Error("journal line requires exactly one positive debit or credit");
  }
  const sequence = Number(input.sequence);
  applyParams({ journalLine: {
    ...input,
    lineKey: deriveJournalLineKey(String(journalEntryId), sequence),
    accountingEntity: { _link: String(accountingEntityId) },
    journalEntry: { _link: String(journalEntryId) },
    ledgerAccount: { _link: String(ledgerAccountId) },
    sequence,
    currency,
    debitMinor,
    creditMinor,
    createdBy: String(identity.user.id),
  } }, record);
  await save(record);
  await writeAudit(api, {
    shopId: entity.shopId,
    actorEmail: identity.user.email || null,
    action: "finance.journalLine.create",
    entityType: "journalLine",
    entityId: record.id,
    before: null,
    after: {
      accountingEntityId: String(accountingEntityId),
      journalEntryId: String(journalEntryId),
      ledgerAccountId: String(ledgerAccountId),
      sequence,
      currency,
      debitMinor,
      creditMinor,
      shadowMode: true,
    },
  });
};

export const options = { actionType: "create", transactional: true };
