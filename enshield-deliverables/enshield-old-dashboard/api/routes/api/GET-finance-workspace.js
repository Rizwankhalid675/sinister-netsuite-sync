import { requireFinanceRouteAccess, sendFinanceRouteError } from "../../lib/finance/routeAccess.js";
import { PERMISSIONS } from "../../lib/permissions.js";

const SECTIONS = Object.freeze({
  ledger: "journalEntry",
  receivables: "receivableDocument",
  payables: "payableDocument",
  reserves: "claimReserve",
  payments: "claimPayment",
  reconciliation: "reconciliationItem",
  audit: "auditLog",
});
const SELECTS = Object.freeze({
  ledger: { id: true, sourceSystem: true, sourceId: true, currency: true, status: true, shadowMode: true, memo: true, preparedAt: true, approvedAt: true, postedAt: true, createdAt: true },
  receivables: { id: true, documentNumber: true, currency: true, amountMinor: true, openAmountMinor: true, status: true, dueAt: true, createdAt: true },
  payables: { id: true, documentNumber: true, currency: true, amountMinor: true, openAmountMinor: true, status: true, dueAt: true, createdAt: true },
  reserves: { id: true, reserveKey: true, claimId: true, claim: { id: true }, currency: true, openingMinor: true, additionsMinor: true, releasesMinor: true, paymentsMinor: true, closingMinor: true, createdAt: true },
  payments: { id: true, externalReference: true, currency: true, amountMinor: true, status: true, initiatedBySystem: true, recordedById: true, verifiedById: true, createdAt: true },
  reconciliation: { id: true, externalReference: true, currency: true, amountMinor: true, status: true, createdAt: true },
  audit: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
});

const route = async ({ reply, api, logger, session, query = {} }) => {
  try {
    const { entity } = await requireFinanceRouteAccess(
      { api, session }, query, PERMISSIONS.VIEW_FINANCE
    );
    const section = query.section || "ledger";
    const modelName = SECTIONS[section];
    if (!modelName) {
      const error = new Error("Unsupported finance workspace section");
      error.statusCode = 400;
      throw error;
    }
    const first = Math.min(100, Math.max(1, Number.parseInt(query.first, 10) || 50));
    const filter = section === "audit"
      ? { accountingEntityId: { equals: String(entity.id) } }
      : { accountingEntityId: { equals: String(entity.id) } };
    const records = await api[modelName].findMany({
      filter,
      first,
      after: query.after || undefined,
      sort: { createdAt: "Descending" },
      select: SELECTS[section],
    });
    const runs = section === "reconciliation"
      ? await api.reconciliationRun.findMany({
        filter: { accountingEntityId: { equals: String(entity.id) } },
        first: 100,
        sort: { createdAt: "Descending" },
        select: {
          id: true, operationKey: true, status: true, unresolvedCount: true,
          preparedById: true, completedById: true, createdAt: true,
        },
      })
      : [];
    if (runs.hasNextPage) {
      const error = new Error("Reconciliation run safety limit exceeded");
      error.statusCode = 503;
      throw error;
    }
    await reply.send({
      success: true,
      section,
      shadowMode: true,
      records,
      reconciliationRuns: runs,
      pageInfo: {
        hasNextPage: Boolean(records.hasNextPage),
        endCursor: records.endCursor || null,
      },
    });
  } catch (error) {
    await sendFinanceRouteError({ reply, logger }, error, "financeWorkspace.read");
  }
};

export default route;
