import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  allocateDocument,
  approveDocument,
  buildOperationKey,
  calculateReserveRollForward,
  completeReconciliation,
  normalizeDocument,
  parseReconciliationCsv,
  persistOperationalRecordOnce,
  recordExternalPayment,
  reconcileExact,
  reconcileRowsOneToOne,
  safeCsvCell,
} from "../api/lib/finance/operationalFinance.js";
import {
  buildAgeing,
  buildAgeingByCurrency,
  buildLedgerDetail,
  buildPaymentRegister,
  buildReserveRollForward,
  buildReserveRollForwardByCurrency,
  buildReserveMovementRollForwardByCurrency,
  buildTrialBalance,
  loadBoundedFinanceRows,
  normalizeReportPeriod,
  buildReconciliationExceptions,
  buildAuditExport,
  reconstructOpenDocumentsAsOf,
} from "../api/lib/finance/reports.js";
import financeWorkspaceRoute from "../api/routes/api/GET-finance-workspace.js";
import financeReportsRoute from "../api/routes/api/GET-finance-reports.js";
import {
  claimDocumentBalance,
  claimOperationalOperation,
  claimRecordRevision,
} from "../api/lib/finance/operations.js";
import { requireSameScopeRelation } from "../api/lib/finance/operationalActionContext.js";

test("AR/AP documents use tenant entity currency and integer minor units", () => {
  const row = normalizeDocument({
    kind: "receivable",
    shopId: "shop-1",
    accountingEntityId: "entity-1",
    documentNumber: "INV-1",
    currency: "usd",
    amountMinor: 1000,
    operationKey: "shop-1:invoice:INV-1",
    preparedById: "operator-1",
  });
  assert.equal(row.currency, "USD");
  assert.equal(row.openAmountMinor, 1000);
  assert.equal(row.status, "draft");
  assert.equal(row.shadowMode, true);
  assert.throws(() => normalizeDocument({ ...row, amountMinor: 10.5 }), /integer minor/);
  assert.throws(() => normalizeDocument({ ...row, shopId: "" }), /shopId/);
});

test("allocations cannot exceed a document open amount or cross entity/currency", () => {
  const doc = {
    id: "ar-1", accountingEntityId: "entity-1", currency: "USD",
    amountMinor: 1000, allocatedMinor: 400, status: "approved",
  };
  assert.equal(allocateDocument(doc, {
    accountingEntityId: "entity-1", currency: "USD", amountMinor: 600,
  }).openAmountMinor, 0);
  assert.throws(() => allocateDocument(doc, {
    accountingEntityId: "entity-1", currency: "USD", amountMinor: 601,
  }), /exceeds open amount/);
  assert.throws(() => allocateDocument(doc, {
    accountingEntityId: "entity-2", currency: "USD", amountMinor: 1,
  }), /entity/);
});

test("document approval requires two people and settled documents are immutable", () => {
  const doc = { status: "draft", preparedById: "operator-1", shadowMode: true };
  assert.equal(approveDocument(doc, "operator-2").status, "approved");
  assert.throws(() => approveDocument(doc, "operator-1"), /different operator/);
  assert.throws(
    () => allocateDocument({ ...doc, status: "settled", amountMinor: 10, allocatedMinor: 10 }, {
      accountingEntityId: undefined, currency: undefined, amountMinor: 0,
    }),
    /immutable/
  );
});

test("reserve roll-forward enforces opening plus additions minus releases and payments", () => {
  assert.equal(calculateReserveRollForward({
    openingMinor: 1000, additionsMinor: 400, releasesMinor: 100, paymentsMinor: 300,
  }), 1000);
  assert.throws(() => calculateReserveRollForward({
    openingMinor: 0, additionsMinor: 1.5, releasesMinor: 0, paymentsMinor: 0,
  }), /integer minor/);
  assert.throws(() => calculateReserveRollForward({
    openingMinor: 0, additionsMinor: 100, releasesMinor: 0, paymentsMinor: 101,
  }), /negative closing reserve/);
});

test("external payment confirmation is idempotent and cannot exceed approved payable", () => {
  const payable = {
    id: "ap-1", accountingEntityId: "entity-1", currency: "USD",
    status: "approved", amountMinor: 1000, paidMinor: 200,
  };
  const payment = recordExternalPayment(payable, {
    accountingEntityId: "entity-1", currency: "USD", amountMinor: 800,
    externalReference: "BANK-123", operationKey: "entity-1:BANK-123",
    verifiedById: "operator-2", recordedById: "operator-1",
  });
  assert.equal(payment.initiatedBySystem, false);
  assert.equal(payment.payableStatus, "settled");
  assert.throws(() => recordExternalPayment(payable, {
    accountingEntityId: "entity-1", currency: "USD", amountMinor: 801,
    externalReference: "BANK-124", operationKey: "entity-1:BANK-124",
    verifiedById: "operator-2", recordedById: "operator-1",
  }), /exceeds approved payable/);
  assert.throws(() => recordExternalPayment(payable, {
    accountingEntityId: "entity-1", currency: "USD", amountMinor: 1,
    externalReference: "BANK-125", operationKey: "entity-1:BANK-125",
    verifiedById: "operator-1", recordedById: "operator-1",
  }), /different operator/);
});

test("external payment confirmation uses authoritative open amount after prior settlements", () => {
  const payable = {
    id: "ap-2", accountingEntityId: "entity-1", currency: "USD",
    status: "partially_settled", amountMinor: 1000, openAmountMinor: 250,
  };
  assert.throws(() => recordExternalPayment(payable, {
    accountingEntityId: "entity-1", currency: "USD", amountMinor: 251,
    externalReference: "BANK-OPEN-1", operationKey: "entity-1:BANK-OPEN-1",
    verifiedById: "operator-2", recordedById: "operator-1",
  }), /exceeds approved payable/);
});

test("exact reconciliation distinguishes exact, ambiguous, and unmatched rows", () => {
  const records = [
    { id: "p1", externalReference: "BANK-1", amountMinor: 100, currency: "USD" },
    { id: "p2", externalReference: "BANK-2", amountMinor: 200, currency: "USD" },
    { id: "p3", externalReference: "BANK-2", amountMinor: 200, currency: "USD" },
  ];
  assert.equal(reconcileExact({ externalReference: "BANK-1", amountMinor: 100, currency: "USD" }, records).status, "matched");
  assert.equal(reconcileExact({ externalReference: "BANK-2", amountMinor: 200, currency: "USD" }, records).status, "exception");
  assert.equal(reconcileExact({ externalReference: "BANK-X", amountMinor: 1, currency: "USD" }, records).status, "exception");
  assert.throws(() => completeReconciliation({ status: "processing", unresolvedCount: 1 }), /unresolved/);
  assert.equal(completeReconciliation({ status: "processing", unresolvedCount: 0 }).status, "completed");
});

test("CSV reconciliation parses quoted rows, validates all rows before work, and rejects oversized input", () => {
  assert.deepEqual(
    parseReconciliationCsv('externalReference,amountMinor,currency\r\n"BANK,1",100,usd\r\n'),
    [{ externalReference: "BANK,1", amountMinor: 100, currency: "USD", rowNumber: 2 }]
  );
  assert.throws(() => parseReconciliationCsv("externalReference,amountMinor,currency\nA,1.5,USD"), /row 2/);
  assert.throws(() => parseReconciliationCsv("bad,header\nA,1"), /required headers/);
  assert.throws(() => parseReconciliationCsv("a".repeat(2_000_001)), /size limit/);
});

test("operation keys are deterministic and CSV cells prevent formula execution", () => {
  assert.equal(buildOperationKey("entity-1", "payment", "BANK-1"), "entity-1:payment:BANK-1");
  assert.equal(safeCsvCell('hello,"world"'), '"hello,""world"""');
  assert.equal(safeCsvCell("=SUM(A1:A2)"), "'=SUM(A1:A2)");
  assert.equal(safeCsvCell("+cmd"), "'+cmd");
});

test("concurrent operational confirmations have one winner and return the same record", async () => {
  const rows = [];
  const saveRecord = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    if (rows.length) {
      const error = new Error("unique");
      error.name = "InvalidRecordError";
      error.code = "GGT_INVALID_RECORD";
      error.validationErrors = [{ apiIdentifier: "paymentKey", message: "must be unique" }];
      throw error;
    }
    const row = { id: "payment-1", paymentKey: "entity-1:payment:BANK-1", amountMinor: 100 };
    rows.push(row);
    return row;
  };
  const results = await Promise.all([
    persistOperationalRecordOnce({ saveRecord, findExisting: async () => rows[0], keyField: "paymentKey", expectedKey: "entity-1:payment:BANK-1" }),
    persistOperationalRecordOnce({ saveRecord, findExisting: async () => rows[0], keyField: "paymentKey", expectedKey: "entity-1:payment:BANK-1" }),
  ]);
  assert.equal(results.filter((row) => row.created).length, 1);
  assert.equal(new Set(results.map((row) => row.record.id)).size, 1);
});

test("operational receipts accept derived composite keys used by the finance UI", async () => {
  let created;
  const result = await claimOperationalOperation({
    internal: { financeOperationReceipt: { async create(input) { created = input; return { id: "r1", ...input }; } } },
  }, {
    operationKey: "entity-1:payment:BANK-1",
    accountingEntityId: "entity-1",
    operation: "record_payment",
    actorId: "operator-1",
  });
  assert.equal(result.claimed, true);
  assert.equal(created.operationKey, "entity-1:payment:BANK-1");
});

test("distinct concurrent operations cannot consume the same document balance snapshot", async () => {
  let claimed = false;
  const api = {
    internal: { financeOperationReceipt: { async create(input) {
      await new Promise((resolve) => setImmediate(resolve));
      if (claimed) {
        const error = new Error("unique");
        error.name = "InvalidRecordError";
        error.code = "GGT_INVALID_RECORD";
        error.validationErrors = [{ apiIdentifier: "operationKey", message: "must be unique" }];
        throw error;
      }
      claimed = true;
      return { id: "balance-claim", ...input };
    } } },
  };
  const settled = await Promise.allSettled([
    claimDocumentBalance(api, { documentId: "ap-1", openAmountMinor: 100, accountingEntityId: "entity-1", actorId: "operator-1" }),
    claimDocumentBalance(api, { documentId: "ap-1", openAmountMinor: 100, accountingEntityId: "entity-1", actorId: "operator-2" }),
  ]);
  assert.equal(settled.filter((item) => item.status === "fulfilled").length, 1);
  const rejection = settled.find((item) => item.status === "rejected").reason;
  assert.equal(rejection.statusCode, 409);
  assert.match(rejection.message, /reload and retry/);
});

test("reserve revision CAS survives an ABA balance cycle and rejects concurrent reuse", async () => {
  const keys = new Set();
  const api = {
    internal: { financeOperationReceipt: { async create(input) {
      await new Promise((resolve) => setImmediate(resolve));
      if (keys.has(input.operationKey)) {
        const error = new Error("unique");
        error.name = "InvalidRecordError";
        error.code = "GGT_INVALID_RECORD";
        error.validationErrors = [{ apiIdentifier: "operationKey", message: "must be unique" }];
        throw error;
      }
      keys.add(input.operationKey);
      return { id: `receipt-${keys.size}`, ...input };
    } } },
  };

  // A reserve can move 100 -> 150 -> 100. Its monotonically increasing
  // revision must keep the next legitimate mutation distinct from the first.
  await claimRecordRevision(api, {
    recordType: "reserve", recordId: "reserve-1", revision: 0,
    accountingEntityId: "entity-1", actorId: "operator-1",
  });
  await claimRecordRevision(api, {
    recordType: "reserve", recordId: "reserve-1", revision: 1,
    accountingEntityId: "entity-1", actorId: "operator-1",
  });
  await claimRecordRevision(api, {
    recordType: "reserve", recordId: "reserve-1", revision: 2,
    accountingEntityId: "entity-1", actorId: "operator-1",
  });

  const concurrent = await Promise.allSettled([
    claimRecordRevision(api, {
      recordType: "reserve", recordId: "reserve-1", revision: 3,
      accountingEntityId: "entity-1", actorId: "operator-1",
    }),
    claimRecordRevision(api, {
      recordType: "reserve", recordId: "reserve-1", revision: 3,
      accountingEntityId: "entity-1", actorId: "operator-2",
    }),
  ]);
  assert.equal(concurrent.filter((item) => item.status === "fulfilled").length, 1);
  const rejection = concurrent.find((item) => item.status === "rejected").reason;
  assert.equal(rejection.statusCode, 409);
  assert.match(rejection.message, /revision changed/);
});

test("finance reports are balanced, bounded, currency-separated, and deterministic", () => {
  const lines = [
    { id: "l1", accountCode: "1000", currency: "USD", debitMinor: 500, creditMinor: 0, accountingDate: "2026-02-01" },
    { id: "l2", accountCode: "4000", currency: "USD", debitMinor: 0, creditMinor: 500, accountingDate: "2026-01-01" },
  ];
  assert.deepEqual(buildTrialBalance(lines), [
    { accountCode: "1000", currency: "USD", debitMinor: 500, creditMinor: 0, balanceMinor: 500 },
    { accountCode: "4000", currency: "USD", debitMinor: 0, creditMinor: 500, balanceMinor: -500 },
  ]);
  const ledger = buildLedgerDetail(lines, { limit: 1 });
  assert.equal(ledger.length, 1);
  assert.equal(ledger[0].id, "l2");
  assert.equal(ledger[0].accountingDate, "2026-01-01");
  assert.throws(() => buildLedgerDetail(lines, { limit: 10001 }), /limit/);
  assert.equal(buildAgeing([{ id: "a", openAmountMinor: 10, dueAt: "2026-07-01" }], "2026-07-23").days1To30Minor, 10);
  assert.equal(buildReserveRollForward([{ openingMinor: 5, additionsMinor: 5, releasesMinor: 2, paymentsMinor: 1 }]).closingMinor, 7);
  assert.equal(buildPaymentRegister([
    { id: "pending", status: "pending", initiatedBySystem: false },
    { id: "verified", status: "verified", verifiedAt: "2026-07-01T00:00:00Z", initiatedBySystem: false },
  ]).length, 1);
  assert.throws(() => buildPaymentRegister([{ id: "p", initiatedBySystem: true }]), /initiated/);
  assert.equal(buildReconciliationExceptions([{ status: "matched" }, { status: "exception", id: "e1" }]).length, 1);
  assert.deepEqual(buildAuditExport([{ id: "a1", metadata: { email: "drop" }, action: "approve" }]), [{ id: "a1", action: "approve" }]);
  assert.deepEqual(
    buildAgeingByCurrency([
      { id: "u", currency: "USD", openAmountMinor: 100, dueAt: "2026-07-01" },
      { id: "e", currency: "EUR", openAmountMinor: 200, dueAt: "2026-07-01" },
    ], "2026-07-23").map((row) => [row.currency, row.days1To30Minor]),
    [["EUR", 200], ["USD", 100]]
  );
  assert.deepEqual(
    buildReserveRollForwardByCurrency([
      { currency: "USD", openingMinor: 10, additionsMinor: 0, releasesMinor: 0, paymentsMinor: 0 },
      { currency: "EUR", openingMinor: 20, additionsMinor: 0, releasesMinor: 0, paymentsMinor: 0 },
    ]).map((row) => [row.currency, row.closingMinor]),
    [["EUR", 20], ["USD", 10]]
  );
  assert.equal(buildAgeing([{ openAmountMinor: 1, dueAt: null }], "2026-07-23").currentMinor, 1);
  assert.throws(() => buildAgeing([{ openAmountMinor: 1, dueAt: "bad" }], "2026-07-23"), /dueAt/);
});

test("report loader exhausts opaque cursors and aborts instead of returning a partial report", async () => {
  const pages = [
    Object.assign([{ id: "1" }, { id: "2" }], { hasNextPage: true, endCursor: "c1" }),
    Object.assign([{ id: "3" }], { hasNextPage: false, endCursor: null }),
  ];
  const rows = await loadBoundedFinanceRows(async ({ after }) => pages[after ? 1 : 0], { pageSize: 2, maxRecords: 3 });
  assert.deepEqual(rows.map((row) => row.id), ["1", "2", "3"]);
  const overflowing = [
    Object.assign([{ id: "1" }, { id: "2" }], { hasNextPage: true, endCursor: "c1" }),
    Object.assign([{ id: "3" }, { id: "4" }], { hasNextPage: false }),
  ];
  await assert.rejects(
    loadBoundedFinanceRows(async ({ after }) => overflowing[after ? 1 : 0], { pageSize: 2, maxRecords: 3 }),
    /safety limit/
  );
});

test("report periods validate ordered ISO dates and apply inclusive day bounds", () => {
  assert.deepEqual(normalizeReportPeriod({ from: "2026-01-01", to: "2026-01-31" }), {
    from: "2026-01-01T00:00:00.000Z",
    to: "2026-01-31T23:59:59.999Z",
  });
  assert.throws(() => normalizeReportPeriod({ from: "bad", to: "2026-01-01" }), /from/);
  assert.throws(() => normalizeReportPeriod({ from: "2026-02-01", to: "2026-01-01" }), /ordered/);
});

test("Task 10 schemas contain tenant, operation, money, approval, and lifecycle fields", async () => {
  const required = {
    receivableDocument: ["shopId", "accountingEntity", "documentKey", "currency", "amountMinor", "openAmountMinor", "status", "shadowMode", "preparedById", "approvedById"],
    receivableAllocation: ["accountingEntity", "receivableDocument", "operationKey", "currency", "amountMinor"],
    payableDocument: ["shopId", "accountingEntity", "documentKey", "currency", "amountMinor", "openAmountMinor", "status", "shadowMode", "preparedById", "approvedById"],
    payableAllocation: ["accountingEntity", "payableDocument", "operationKey", "currency", "amountMinor"],
    claimReserve: ["shopId", "accountingEntity", "claim", "reserveKey", "currency", "openingMinor", "additionsMinor", "releasesMinor", "paymentsMinor", "closingMinor"],
    claimPayment: ["accountingEntity", "payableDocument", "paymentKey", "externalReference", "currency", "amountMinor", "initiatedBySystem", "recordedById", "verifiedById"],
    reconciliationRun: ["shopId", "accountingEntity", "operationKey", "status", "unresolvedCount", "completedById"],
    reconciliationItem: ["accountingEntity", "reconciliationRun", "itemKey", "externalReference", "currency", "amountMinor", "status"],
    reportRun: ["shopId", "accountingEntity", "operationKey", "reportType", "status", "parametersJson", "rowCount"],
  };
  for (const [model, fields] of Object.entries(required)) {
    const source = await readFile(new URL(`../api/models/${model}/schema.gadget.ts`, import.meta.url), "utf8");
    for (const field of fields) assert.match(source, new RegExp(`\\b${field}\\s*:`), `${model}.${field}`);
    assert.match(source, /unique:\s*true/, `${model} must have a concurrency key`);
  }
});

test("Task 10 release gate forbids automatic payment, tax, FX, bank feeds, and sync", async () => {
  const source = await readFile(new URL("../docs/finance-operations-release-gate.md", import.meta.url), "utf8");
  for (const phrase of ["no payment initiation", "no automatic tax", "no FX", "no bank feed", "no external accounting sync", "owner/CPA"]) {
    assert.match(source, new RegExp(phrase, "i"));
  }
});

test("finance workspace API authenticates before any finance model read", async () => {
  let reads = 0;
  const reply = { statusCode: 200, code(value) { this.statusCode = value; return this; }, async send() {} };
  await financeWorkspaceRoute({
    reply,
    api: new Proxy({ internalOperator: { async findFirst() { return null; } } }, {
      get(target, key) { if (key in target) return target[key]; reads += 1; return {}; },
    }),
    session: { get() { return null; } },
    query: { shopId: "shop-1", accountingEntityId: "entity-1", section: "receivables" },
    logger: { error() {} },
  });
  assert.equal(reply.statusCode, 401);
  assert.equal(reads, 0);
});

test("finance report API authenticates before report reads", async () => {
  let reads = 0;
  const reply = { statusCode: 200, code(value) { this.statusCode = value; return this; }, async send() {} };
  await financeReportsRoute({
    reply,
    api: new Proxy({ internalOperator: { async findFirst() { return null; } } }, {
      get(target, key) { if (key in target) return target[key]; reads += 1; return {}; },
    }),
    session: { get() { return null; } },
    query: { shopId: "shop-1", accountingEntityId: "entity-1", reportType: "trial_balance" },
    logger: { error() {} },
  });
  assert.equal(reply.statusCode, 401);
  assert.equal(reads, 0);
});

test("finance workspace and mutation routes/pages expose every required area behind finance permission", async () => {
  for (const path of [
    "../api/routes/api/GET-finance-workspace.js",
    "../api/routes/api/POST-finance-operations.js",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /requireFinanceRouteAccess/);
    assert.doesNotMatch(source, /initiatePayment|sendPayment|bankFeed|accountingSync/);
  }
  const page = await readFile(new URL("../web/routes/finance.jsx", import.meta.url), "utf8");
  for (const area of ["Overview", "Ledger", "Receivables", "Payables", "Claim reserves", "Payment register", "Reconciliation", "Reports", "Audit"]) {
    assert.match(page, new RegExp(area, "i"));
  }
  assert.match(page, /PERMISSIONS\.VIEW_FINANCE/);
  const app = await readFile(new URL("../web/components/App.jsx", import.meta.url), "utf8");
  const nav = await readFile(new URL("../web/lib/navigation.js", import.meta.url), "utf8");
  assert.match(app, /path="finance"/);
  assert.match(nav, /path:\s*"\/finance"/);
});

test("finance mutation route delegates dependent writes to transactional model actions", async () => {
  const source = await readFile(new URL("../api/routes/api/POST-finance-operations.js", import.meta.url), "utf8");
  assert.doesNotMatch(source, /internal\[(?:model|allocationModel)\]\.update/);
  assert.doesNotMatch(source, /internal\[allocationModel\]\.create/);
  assert.match(source, /internal\[model\]\.allocate/);
  assert.match(source, /internal\.claimPayment\.verify/);
  for (const path of [
    "../api/models/receivableDocument/actions/allocate.js",
    "../api/models/payableDocument/actions/allocate.js",
    "../api/models/claimPayment/actions/create.js",
    "../api/models/claimPayment/actions/verify.js",
    "../api/models/claimReserve/actions/adjust.js",
    "../api/models/claimReserve/actions/release.js",
    "../api/models/reconciliationRun/actions/complete.js",
    "../api/models/reconciliationItem/actions/resolve.js",
  ]) {
    const action = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(action, /transactional:\s*true/, `${path} must be transactional`);
  }
});

test("payment schema supports pending authenticated verification lifecycle", async () => {
  const source = await readFile(new URL("../api/models/claimPayment/schema.gadget.ts", import.meta.url), "utf8");
  assert.match(source, /\bstatus\s*:/);
  assert.match(source, /pending/);
  assert.match(source, /verified/);
  assert.doesNotMatch(source, /verifiedById:\s*\{[^}]*required:\s*true/s);
});

test("settled/completed finance records cannot be changed by API actions", async () => {
  const allocation = await readFile(new URL("../api/models/payableDocument/actions/allocate.js", import.meta.url), "utf8");
  const verify = await readFile(new URL("../api/models/claimPayment/actions/verify.js", import.meta.url), "utf8");
  const reconciliation = await readFile(new URL("../api/models/reconciliationRun/actions/complete.js", import.meta.url), "utf8");
  assert.match(allocation, /allocateDocument/);
  assert.match(verify, /recordExternalPayment/);
  assert.match(reconciliation, /completeReconciliation/);
});

test("document and reserve creation use authenticated transactional model actions", async () => {
  const route = await readFile(new URL("../api/routes/api/POST-finance-operations.js", import.meta.url), "utf8");
  assert.match(route, /internal\[model\]\.create\(\{\s*\[model\]:/s);
  assert.match(route, /action === "create_reserve"/);
  assert.match(route, /internal\.claimReserve\.create/);
  for (const path of [
    "../api/models/receivableDocument/actions/create.js",
    "../api/models/payableDocument/actions/create.js",
    "../api/models/claimReserve/actions/create.js",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /transactional:\s*true/);
    assert.match(source, /claimOperationalOperation/);
    assert.match(source, /writeAudit/);
    assert.match(source, /requireOperationalContext/);
  }
});

test("operational creates reject foreign claim and payable relationships before mutation", async () => {
  let mutations = 0;
  const api = {
    claim: { async findFirst({ filter }) {
      assert.deepEqual(filter.AND[1], { shopId: { equals: "shop-1" } });
      return null;
    } },
    payableDocument: { async findFirst({ filter }) {
      assert.deepEqual(filter.AND[1], { accountingEntityId: { equals: "entity-1" } });
      return null;
    } },
    internal: new Proxy({}, { get() { mutations += 1; return {}; } }),
  };
  await assert.rejects(
    requireSameScopeRelation({ api, model: "claim", id: "claim-foreign", scopeField: "shopId", scopeId: "shop-1" }),
    /outside the accounting scope/
  );
  await assert.rejects(
    requireSameScopeRelation({ api, model: "payableDocument", id: "ap-foreign", scopeField: "accountingEntityId", scopeId: "entity-1" }),
    /outside the accounting scope/
  );
  assert.equal(mutations, 0);
});

test("reserve movement report separates pre-period opening from in-period activity by currency", () => {
  const rows = buildReserveMovementRollForwardByCurrency([
    { currency: "USD", movementType: "opening", amountMinor: 1000, effectiveAt: "2026-01-01T00:00:00Z" },
    { currency: "USD", movementType: "addition", amountMinor: 300, effectiveAt: "2026-07-02T00:00:00Z" },
    { currency: "USD", movementType: "release", amountMinor: 100, effectiveAt: "2026-07-03T00:00:00Z" },
    { currency: "USD", movementType: "payment", amountMinor: 200, effectiveAt: "2026-07-04T00:00:00Z" },
    { currency: "EUR", movementType: "opening", amountMinor: 500, effectiveAt: "2026-01-01T00:00:00Z" },
  ], { from: "2026-07-01T00:00:00.000Z", to: "2026-07-31T23:59:59.999Z" });
  assert.deepEqual(rows, [
    { currency: "EUR", openingMinor: 500, additionsMinor: 0, releasesMinor: 0, paymentsMinor: 0, closingMinor: 500 },
    { currency: "USD", openingMinor: 1000, additionsMinor: 300, releasesMinor: 100, paymentsMinor: 200, closingMinor: 1000 },
  ]);
});

test("finance actions persist reserve movements, reconciliation evidence, receipts, and scoped audits", async () => {
  const files = await Promise.all([
    "../api/models/claimPayment/actions/verify.js",
    "../api/models/claimReserve/actions/adjust.js",
    "../api/models/claimReserve/actions/release.js",
    "../api/models/reconciliationItem/actions/resolve.js",
  ].map((path) => readFile(new URL(path, import.meta.url), "utf8")));
  for (const source of files) {
    assert.match(source, /claimOperationalOperation|claimDocumentBalance/);
    assert.match(source, /writeAudit/);
  }
  assert.match(files[0], /claimReserveMovement\.create/);
  assert.match(files[3], /matchedClaimPayment/);
  assert.match(files[3], /evidenceCode/);
  assert.match(files[3], /resolutionReason/);
});

test("historical ageing uses only settlements effective by the UTC as-of boundary", () => {
  const rows = reconstructOpenDocumentsAsOf(
    [{ id: "ap-1", amountMinor: 1000, currency: "USD", dueAt: "2026-07-01", createdAt: "2026-07-01T00:00:00Z" }],
    [
      { documentId: "ap-1", amountMinor: 100, createdAt: "2026-07-31T23:59:59.999Z" },
      { documentId: "ap-1", amountMinor: 200, createdAt: "2026-08-01T00:00:00.000Z" },
    ],
    [
      { documentId: "ap-1", amountMinor: 300, status: "verified", verifiedAt: "2026-07-31T23:59:59.999Z" },
      { documentId: "ap-1", amountMinor: 400, status: "verified", verifiedAt: "2026-08-01T00:00:00.000Z" },
    ],
    "2026-07-31T23:59:59.999Z"
  );
  assert.equal(rows[0].openAmountMinor, 600);
});

test("historical ageing excludes draft and void documents", () => {
  const rows = reconstructOpenDocumentsAsOf([
    { id: "approved", status: "approved", amountMinor: 100, createdAt: "2026-01-01T00:00:00Z" },
    { id: "draft", status: "draft", amountMinor: 200, createdAt: "2026-01-01T00:00:00Z" },
    { id: "void", status: "void", amountMinor: 300, createdAt: "2026-01-01T00:00:00Z" },
  ], [], [], "2026-07-31T23:59:59.999Z");
  assert.deepEqual(rows.map((row) => row.id), ["approved"]);
});

test("finance report route uses accounting periods and verified payment dates", async () => {
  const source = await readFile(new URL("../api/routes/api/GET-finance-reports.js", import.meta.url), "utf8");
  assert.match(source, /accountingPeriod:\s*\{[\s\S]*?endsAt:/);
  assert.doesNotMatch(source, /const postedAtFilter/);
  assert.match(source, /status:\s*\{\s*equals:\s*"verified"/);
  assert.match(source, /verifiedAt:\s*\{\s*greaterThanOrEqual:\s*period\.from,\s*lessThanOrEqual:\s*period\.to/);
});

test("automatic reconciliation consumes each exact payment only once", () => {
  const rows = [
    { externalReference: "BANK-1", amountMinor: 100, currency: "USD", rowNumber: 2 },
    { externalReference: "BANK-1", amountMinor: 100, currency: "USD", rowNumber: 3 },
  ];
  const result = reconcileRowsOneToOne(rows, [
    { id: "payment-1", externalReference: "BANK-1", amountMinor: 100, currency: "USD" },
  ]);
  assert.equal(result[0].result.status, "matched");
  assert.equal(result[0].result.evidenceCode, "exact_reference_currency_amount");
  assert.equal(result[1].result.status, "exception");
});

test("payment currency validation precedes every balance claim", async () => {
  const source = await readFile(new URL("../api/models/claimPayment/actions/verify.js", import.meta.url), "utf8");
  assert.ok(source.indexOf("currency must match") < source.indexOf("await claimDocumentBalance"));
});
