import { requireFinanceRouteAccess, sendFinanceRouteError } from "../../lib/finance/routeAccess.js";
import { PERMISSIONS } from "../../lib/permissions.js";
import {
  buildAgeing,
  buildAgeingByCurrency,
  buildAuditExport,
  buildLedgerDetail,
  buildPaymentRegister,
  buildReconciliationExceptions,
  buildReserveRollForward,
  buildReserveRollForwardByCurrency,
  buildReserveMovementRollForwardByCurrency,
  buildTrialBalance,
  loadBoundedFinanceRows,
  normalizeReportPeriod,
  reconstructOpenDocumentsAsOf,
} from "../../lib/finance/reports.js";
import { persistOperationalRecordOnce } from "../../lib/finance/operationalFinance.js";

const REPORT_TYPES = new Set([
  "trial_balance", "ledger_detail", "ar_ageing", "ap_ageing",
  "reserve_roll_forward", "payment_register",
  "reconciliation_exceptions", "audit_export",
]);

const route = async ({ reply, api, logger, session, query = {} }) => {
  try {
    const { entity } = await requireFinanceRouteAccess(
      { api, session }, query, PERMISSIONS.VIEW_FINANCE
    );
    if (!REPORT_TYPES.has(query.reportType)) {
      const error = new Error("Unsupported finance report type");
      error.statusCode = 400;
      throw error;
    }
    const currentYear = new Date().getUTCFullYear();
    const period = normalizeReportPeriod({
      from: query.from || `${currentYear}-01-01`,
      to: query.to || `${currentYear}-12-31`,
    });
    const entityFilter = { accountingEntityId: { equals: String(entity.id) } };
    const periodFilter = {
      createdAt: {
        greaterThanOrEqual: period.from,
        lessThanOrEqual: period.to,
      },
    };
    let rows;
    if (query.reportType === "trial_balance" || query.reportType === "ledger_detail") {
      // The accounting period end is the authoritative accounting date. postedAt is
      // workflow metadata and may occur after the period to which the entry belongs.
      const accountingDateFilter = query.reportType === "trial_balance"
        ? { journalEntry: { accountingPeriod: {
          status: { in: ["open", "closed"] }, endsAt: { lessThanOrEqual: period.to },
        } } }
        : { journalEntry: { accountingPeriod: {
          status: { in: ["open", "closed"] },
          endsAt: { greaterThanOrEqual: period.from, lessThanOrEqual: period.to },
        } } };
      const source = await loadBoundedFinanceRows(({ first, after }) =>
        api.journalLine.findMany({
          filter: { AND: [entityFilter, { journalEntry: { status: { equals: "posted" } } }, accountingDateFilter] },
          first, after,
          sort: { createdAt: "Ascending" },
          select: {
            id: true, currency: true, debitMinor: true, creditMinor: true, createdAt: true,
            ledgerAccount: { code: true },
            journalEntry: { postedAt: true, accountingPeriod: { startsAt: true, endsAt: true, status: true } },
          },
        })
      );
      const normalized = source.map((row) => ({
        ...row, accountCode: row.ledgerAccount?.code,
        accountingDate: row.journalEntry?.accountingPeriod?.endsAt,
        accountingPeriodStatus: row.journalEntry?.accountingPeriod?.status,
      }));
      rows = query.reportType === "trial_balance"
        ? buildTrialBalance(normalized)
        : buildLedgerDetail(normalized, { limit: 10000 });
    } else if (query.reportType === "ar_ageing" || query.reportType === "ap_ageing") {
      const model = query.reportType === "ar_ageing" ? "receivableDocument" : "payableDocument";
      const effectiveDate = query.asOf || period.to.slice(0, 10);
      const effectiveAt = `${effectiveDate}T23:59:59.999Z`;
      const source = await loadBoundedFinanceRows(({ first, after }) =>
        api[model].findMany({
          filter: { AND: [
            entityFilter,
            { createdAt: { lessThanOrEqual: effectiveAt } },
            { status: { in: ["approved", "partially_settled", "settled"] } },
          ] }, first, after, sort: { createdAt: "Ascending" },
          select: { id: true, currency: true, amountMinor: true, status: true, dueAt: true, createdAt: true },
        })
      );
      const allocationModel = query.reportType === "ar_ageing" ? "receivableAllocation" : "payableAllocation";
      const documentIdField = query.reportType === "ar_ageing" ? "receivableDocumentId" : "payableDocumentId";
      const allocations = await loadBoundedFinanceRows(({ first, after }) => api[allocationModel].findMany({
        filter: { AND: [entityFilter, { createdAt: { lessThanOrEqual: effectiveAt } }] }, first, after,
        select: { id: true, amountMinor: true, createdAt: true, [documentIdField]: true },
      }));
      const normalizedAllocations = allocations.map((row) => ({ ...row, documentId: row[documentIdField] }));
      const payments = query.reportType === "ap_ageing"
        ? await loadBoundedFinanceRows(({ first, after }) => api.claimPayment.findMany({
          filter: { AND: [entityFilter, { status: { equals: "verified" } }, { verifiedAt: { lessThanOrEqual: effectiveAt } }] }, first, after,
          select: { id: true, amountMinor: true, status: true, verifiedAt: true, payableDocumentId: true },
        }))
        : [];
      rows = buildAgeingByCurrency(
        reconstructOpenDocumentsAsOf(source, normalizedAllocations, payments.map((row) => ({ ...row, documentId: row.payableDocumentId })), effectiveAt),
        effectiveDate
      );
    } else if (query.reportType === "reserve_roll_forward") {
      const source = await loadBoundedFinanceRows(({ first, after }) =>
        api.claimReserveMovement.findMany({ filter: { AND: [entityFilter, { effectiveAt: { lessThanOrEqual: period.to } }] }, first, after, sort: { effectiveAt: "Ascending" } })
      );
      rows = buildReserveMovementRollForwardByCurrency(source, period);
    } else if (query.reportType === "payment_register") {
      const source = await loadBoundedFinanceRows(({ first, after }) =>
        api.claimPayment.findMany({
          filter: { AND: [
            entityFilter,
            { status: { equals: "verified" } },
            { verifiedAt: { greaterThanOrEqual: period.from, lessThanOrEqual: period.to } },
          ] },
          first, after, sort: { verifiedAt: "Ascending" },
        })
      );
      rows = buildPaymentRegister(source);
    } else if (query.reportType === "reconciliation_exceptions") {
      const source = await loadBoundedFinanceRows(({ first, after }) =>
        api.reconciliationItem.findMany({
          filter: { AND: [entityFilter, periodFilter, { status: { equals: "exception" } }] },
          first, after, sort: { createdAt: "Ascending" },
        })
      );
      rows = buildReconciliationExceptions(source);
    } else {
      const source = await loadBoundedFinanceRows(({ first, after }) =>
        api.auditLog.findMany({
          filter: { AND: [
            { shopId: { equals: String(query.shopId) } },
            periodFilter,
            { accountingEntityId: { equals: String(entity.id) } },
          ] },
          first, after, sort: { createdAt: "Ascending" },
          select: { id: true, action: true, entityType: true, entityId: true, createdAt: true },
        })
      );
      rows = buildAuditExport(source);
    }
    const operationKey = `${entity.id}:report:${query.reportType}:${period.from}:${period.to}:${query.asOf || ""}`;
    const reportRun = await persistOperationalRecordOnce({
      keyField: "operationKey",
      expectedKey: operationKey,
      saveRecord: () => api.internal.reportRun.create({
        shopId: String(query.shopId),
        accountingEntity: { _link: String(entity.id) },
        operationKey,
        reportType: query.reportType,
        status: "completed",
        parametersJson: { ...period, asOf: query.asOf || null },
        rowCount: rows.length,
      }),
      findExisting: () => api.reportRun.findFirst({
        filter: { AND: [
          { operationKey: { equals: operationKey } },
          { accountingEntityId: { equals: String(entity.id) } },
        ] },
      }),
    });
    await reply.send({
      success: true,
      reportType: query.reportType,
      accountingEntityId: String(entity.id),
      shadowMode: true,
      generatedAt: new Date().toISOString(),
      period,
      rows,
      reportRunId: reportRun.record.id,
    });
  } catch (error) {
    await sendFinanceRouteError({ reply, logger }, error, `financeReports.${query.reportType || "unknown"}`);
  }
};

export default route;
