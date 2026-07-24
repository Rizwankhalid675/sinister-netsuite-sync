import { PERMISSIONS } from "../permissions.js";
import { requireInternalAccess, shopIdFilter } from "../internalAccess.js";

function relationId(record, field) {
  return record?.[`${field}Id`] ?? record?.[field]?.id ?? record?.[field]?._link ?? null;
}

export async function requireAccountingEntity({ api, shopIds, accountingEntityId }) {
  const entity = await api.accountingEntity.findFirst({
    filter: {
      AND: [
        { id: { equals: accountingEntityId } },
        shopIdFilter(shopIds),
      ],
    },
    select: { id: true, shopId: true },
  });
  if (!entity) {
    const error = new Error("Forbidden: accounting entity is outside the assigned tenant");
    error.statusCode = 403;
    throw error;
  }
  return entity;
}

export async function validateFinanceRelations({
  api,
  accountingEntityId,
  accountingPeriodId,
  financialEventId,
  currency,
  lines = [],
}) {
  if (!accountingPeriodId) throw new Error("accountingPeriod is required");
  const period = await api.accountingPeriod.findFirst({
    filter: {
      AND: [
        { id: { equals: accountingPeriodId } },
        { accountingEntityId: { equals: accountingEntityId } },
      ],
    },
    select: { id: true, accountingEntityId: true, status: true },
  });
  if (!period) throw new Error("accounting period must belong to the accounting entity");

  let financialEvent = null;
  if (financialEventId) {
    financialEvent = await api.financialEvent.findFirst({
      filter: {
        AND: [
          { id: { equals: financialEventId } },
          { accountingEntityId: { equals: accountingEntityId } },
        ],
      },
      select: { id: true, accountingEntityId: true, currency: true },
    });
    if (!financialEvent || financialEvent.currency !== currency) {
      throw new Error("financial event must belong to the entity and match journal currency");
    }
  }

  const ledgerAccounts = [];
  for (const line of lines) {
    if (!line.ledgerAccountId) throw new Error("journal line ledger account is required");
    const account = await api.ledgerAccount.findFirst({
      filter: {
        AND: [
          { id: { equals: line.ledgerAccountId } },
          { accountingEntityId: { equals: accountingEntityId } },
        ],
      },
      select: { id: true, accountingEntityId: true, currency: true, status: true },
    });
    if (!account || account.status !== "active") {
      throw new Error("ledger account must be active and belong to the accounting entity");
    }
    if (account.currency !== currency || line.currency !== currency) {
      throw new Error("ledger account currency must match the journal");
    }
    ledgerAccounts.push(account);
  }
  return { period, financialEvent, ledgerAccounts };
}

export async function requireFinanceContext({ api, session, record, includeLines = true }) {
  const access = await requireInternalAccess(
    { api, session },
    PERMISSIONS.EDIT_FINANCE
  );
  const accountingEntityId = relationId(record, "accountingEntity");
  if (!accountingEntityId) throw new Error("journal accountingEntity is required");

  const entity = await requireAccountingEntity({
    api,
    shopIds: access.shopIds,
    accountingEntityId,
  });

  const accountingPeriodId = relationId(record, "accountingPeriod");
  const lines = includeLines
    ? await api.journalLine.findMany({
        filter: {
          AND: [
            { journalEntryId: { equals: record.id } },
            { accountingEntityId: { equals: accountingEntityId } },
          ],
        },
        first: 251,
        select: {
          id: true,
          accountingEntityId: true,
          ledgerAccountId: true,
          currency: true,
          debitMinor: true,
          creditMinor: true,
        },
      })
    : [];
  if (lines.length > 250 || lines.hasNextPage) {
    throw new Error("journal exceeds the 250-line safety limit");
  }
  const { period } = await validateFinanceRelations({
    api,
    accountingEntityId,
    accountingPeriodId,
    financialEventId: relationId(record, "financialEvent"),
    currency: record.currency,
    lines: Array.from(lines),
  });
  return {
    identity: {
      user: access.operator,
      shopId: entity.shopId,
      shopIds: access.shopIds,
    },
    accountingEntityId: String(accountingEntityId),
    period,
    lines: Array.from(lines),
  };
}

export function journalSnapshot(record, accountingEntityId) {
  return {
    id: String(record.id),
    accountingEntityId,
    accountingPeriodId: String(relationId(record, "accountingPeriod")),
    currency: record.currency,
    status: record.status,
    shadowMode: record.shadowMode,
    preparedBy: record.preparedBy,
    approvedBy: record.approvedBy,
  };
}
