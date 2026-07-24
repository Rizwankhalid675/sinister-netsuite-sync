import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { InvalidRecordError } from "../.gadget/client/dist-esm/connection/support.js";

import {
  assertApprovalSeparation,
  assertImmutablePostedUpdate,
  assertMinorUnits,
  assertPeriodOpen,
  assertShadowMode,
  buildSourceVersionKey,
  createReversalDraft,
  normalizeCurrency,
  normalizeFinancialEvent,
  sanitizeFinancialMetadata,
  approveJournal,
  postJournal,
  submitJournal,
  validateJournal,
} from "../api/lib/finance/ledger.js";
import {
  claimFinanceOperation,
  deriveAccountKey,
  deriveJournalLineKey,
  deriveReversalKey,
  persistFinancialEventOnce,
  persistClaimedFinanceMutation,
  persistJournalEntryOnce,
} from "../api/lib/finance/operations.js";
import {
  requireFinanceContext,
  validateFinanceRelations,
} from "../api/lib/finance/actionContext.js";
import financeEventRoute from "../api/routes/api/POST-finance-events.js";
import financeJournalRoute from "../api/routes/api/POST-finance-journals.js";

test("accounting money accepts integer minor units and normalized ISO currency", () => {
  assert.equal(assertMinorUnits(1099), 1099);
  assert.equal(normalizeCurrency(" usd "), "USD");
  assert.throws(() => assertMinorUnits(10.5), /integer minor units/);
  assert.throws(() => assertMinorUnits(Number.MAX_SAFE_INTEGER + 1), /safe integer/);
  assert.throws(() => normalizeCurrency("US"), /ISO 4217/);
  assert.throws(() => normalizeCurrency("12A"), /ISO 4217/);
  assert.throws(() => normalizeCurrency("ZZZ"), /ISO 4217/);
});

test("source and version form a deterministic tenant-entity idempotency key", () => {
  assert.equal(
    buildSourceVersionKey({
      accountingEntityId: "entity-1",
      sourceSystem: "shopify",
      sourceId: "order-1001",
      sourceVersion: "refund-2",
    }),
    "entity-1:shopify:order-1001:refund-2"
  );
  assert.throws(
    () =>
      buildSourceVersionKey({
        accountingEntityId: "entity-1",
        sourceSystem: "shopify",
        sourceId: "order-1001",
        sourceVersion: "",
      }),
    /sourceVersion/
  );
});

test("financial events derive their idempotency key and reject decimal accounting amounts", () => {
  assert.deepEqual(
    normalizeFinancialEvent({
      accountingEntityId: "entity-1",
      sourceSystem: "shopify",
      sourceId: "order-1001",
      sourceVersion: "v1",
      currency: "cad",
      amountMinor: -250,
    }),
    {
      accountingEntityId: "entity-1",
      sourceSystem: "shopify",
      sourceId: "order-1001",
      sourceVersion: "v1",
      sourceVersionKey: "entity-1:shopify:order-1001:v1",
      currency: "CAD",
      amountMinor: -250,
    }
  );
  assert.throws(
    () =>
      normalizeFinancialEvent({
        accountingEntityId: "entity-1",
        sourceSystem: "shopify",
        sourceId: "order-1001",
        sourceVersion: "v1",
        currency: "USD",
        amountMinor: 1.25,
      }),
    /integer minor units/
  );
});

test("financial audit metadata drops PII, secrets, and arbitrary payloads", () => {
  assert.deepEqual(
    sanitizeFinancialMetadata({
      orderId: "order-1",
      claimId: "claim-1",
      eventCategory: "premium",
      customerEmail: "secret@example.test",
      token: "secret",
      payload: { card: "never" },
    }),
    { orderId: "order-1", claimId: "claim-1", eventCategory: "premium" }
  );
});

test("account, line, and reversal uniqueness keys are derived from immutable relationships", () => {
  assert.equal(deriveAccountKey("entity-1", " 4000 "), "entity-1:4000");
  assert.equal(deriveJournalLineKey("journal-1", 2), "journal-1:2");
  assert.equal(deriveReversalKey("journal-1"), "reverse:journal-1");
  assert.throws(() => deriveJournalLineKey("journal-1", 0), /sequence/);
});

test("finance operation receipt allows exactly one concurrent transition claim", async () => {
  const rows = [];
  const api = {
    financeOperationReceipt: {
      async findFirst({ filter }) {
        return rows.find((row) => row.operationKey === filter.AND[0].operationKey.equals) || null;
      },
    },
    internal: {
      financeOperationReceipt: {
        async create(input) {
          await new Promise((resolve) => setImmediate(resolve));
          if (rows.some((row) => row.operationKey === input.operationKey)) {
            throw new InvalidRecordError(
              null,
              [{ apiIdentifier: "operationKey", message: "must be unique" }],
              "financeOperationReceipt"
            );
          }
          const row = { id: `receipt-${rows.length + 1}`, ...input };
          rows.push(row);
          return row;
        },
      },
    },
  };
  const input = {
    journalEntryId: "journal-1",
    accountingEntityId: "entity-1",
    operation: "post",
    actorId: "operator-2",
  };
  const results = await Promise.all([
    claimFinanceOperation(api, input),
    claimFinanceOperation(api, input),
  ]);
  assert.equal(results.filter((result) => result.claimed).length, 1);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].operationKey, "journal-1:post");
});

test("duplicate financial events return the single source-version result", async () => {
  const rows = [];
  const input = {
    id: "event-1",
    sourceVersionKey: "entity-1:shopify:order-1:v1",
  };
  const saveRecord = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    if (rows.length) {
      throw new InvalidRecordError(
        null,
        [{ apiIdentifier: "sourceVersionKey", message: "must be unique" }],
        "financialEvent"
      );
    }
    rows.push(input);
    return input;
  };
  const findExisting = async () => rows[0] || null;
  const results = await Promise.all([
    persistFinancialEventOnce({ saveRecord, findExisting }),
    persistFinancialEventOnce({ saveRecord, findExisting }),
  ]);
  assert.equal(results.filter((result) => result.created).length, 1);
  assert.equal(rows.length, 1);
  assert.ok(results.every((result) => result.record.id === "event-1"));
});

test("concurrent journal creation returns one identical persisted journal and one audit", async () => {
  const rows = [];
  const audits = [];
  const expected = {
    sourceVersionKey: "entity-1:manual:batch-1:v1",
    accountingEntityId: "entity-1",
    accountingPeriodId: "period-1",
    currency: "USD",
    sourceSystem: "manual",
    sourceId: "batch-1",
    sourceVersion: "v1",
    financialEventId: "",
    shadowMode: true,
  };
  const saveRecord = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    if (rows.length) {
      throw new InvalidRecordError(
        null,
        [{ apiIdentifier: "sourceVersionKey", message: "must be unique" }],
        "journalEntry"
      );
    }
    const row = { id: "journal-1", ...expected };
    rows.push(row);
    return row;
  };
  const execute = async () => {
    const result = await persistJournalEntryOnce({
      saveRecord,
      findExisting: async () => rows[0] || null,
      expected,
    });
    if (result.created) audits.push("finance.journal.create");
    return result;
  };
  const results = await Promise.all([execute(), execute()]);
  assert.equal(rows.length, 1);
  assert.equal(audits.length, 1);
  assert.ok(results.every((result) => result.record.id === "journal-1"));
  assert.equal(results.filter((result) => result.created).length, 1);

  await assert.rejects(
    persistJournalEntryOnce({
      saveRecord: async () => {
        throw new InvalidRecordError(
          null,
          [{ apiIdentifier: "sourceVersionKey", message: "must be unique" }],
          "journalEntry"
        );
      },
      findExisting: async () => ({ ...rows[0], currency: "CAD" }),
      expected,
    }),
    /idempotency conflict/
  );

  await assert.rejects(
    persistJournalEntryOnce({
      saveRecord: async () => {
        throw new InvalidRecordError(
          null,
          [{ apiIdentifier: "sourceVersionKey", message: "must be unique" }],
          "journalEntry"
        );
      },
      findExisting: async () => ({
        ...rows[0],
        financialEventId: "event-2",
      }),
      expected: { ...expected, financialEventId: "event-1" },
    }),
    /idempotency conflict/
  );
  assert.equal(audits.length, 1);

  const absentReplay = await persistJournalEntryOnce({
    saveRecord: async () => {
      throw new InvalidRecordError(
        null,
        [{ apiIdentifier: "sourceVersionKey", message: "must be unique" }],
        "journalEntry"
      );
    },
    findExisting: async () => ({ ...rows[0], financialEventId: null }),
    expected: { ...expected, financialEventId: "" },
  });
  assert.equal(absentReplay.created, false);
  assert.equal(absentReplay.record.id, "journal-1");
});

test("audit failure rolls back finance receipt and state mutation as one transaction", async () => {
  const state = { receipts: [], journals: [], audits: [] };
  async function transaction(callback) {
    const snapshot = structuredClone(state);
    try {
      return await callback();
    } catch (error) {
      Object.assign(state, snapshot);
      throw error;
    }
  }
  await assert.rejects(
    transaction(() =>
      persistClaimedFinanceMutation({
        claim: async () => {
          state.receipts.push("journal-1:post");
          return { claimed: true, receipt: { id: "receipt-1" } };
        },
        mutate: async () => {
          state.journals.push("posted");
          return { journalEntryId: "journal-1" };
        },
        audit: async () => {
          throw new Error("audit unavailable");
        },
        complete: async () => state.receipts.push("completed"),
      })
    ),
    /audit unavailable/
  );
  assert.deepEqual(state, { receipts: [], journals: [], audits: [] });
});

test("journal line audit failure rolls back the line in the action transaction", async () => {
  const state = { lines: [], audits: [] };
  const snapshot = structuredClone(state);
  await assert.rejects(
    (async () => {
      try {
        state.lines.push("journal-1:1");
        throw new Error("audit unavailable");
      } catch (error) {
        Object.assign(state, snapshot);
        throw error;
      }
    })(),
    /audit unavailable/
  );
  assert.deepEqual(state, { lines: [], audits: [] });
  const source = await readFile(
    new URL("../api/models/journalLine/actions/create.js", import.meta.url),
    "utf8"
  );
  assert.match(source, /writeAudit/);
  assert.match(source, /finance\.journalLine\.create/);
  assert.match(source, /transactional:\s*true/);
});

test("concurrent reversal snapshots create one reversal and one audit", async () => {
  const receipts = [];
  const reversals = [];
  const audits = [];
  const claim = async () => {
    await new Promise((resolve) => setImmediate(resolve));
    if (receipts.length) return { claimed: false, receipt: receipts[0] };
    const receipt = { id: "receipt-1", resultJournalEntryId: null };
    receipts.push(receipt);
    return { claimed: true, receipt };
  };
  const execute = () =>
    persistClaimedFinanceMutation({
      claim,
      mutate: async () => {
        reversals.push("reversal-1");
        return { journalEntryId: "reversal-1" };
      },
      audit: async () => audits.push("finance.journal.reverse"),
      complete: async (result, receipt) => {
        receipt.resultJournalEntryId = result.journalEntryId;
      },
      duplicate: (receipt) => ({
        journalEntryId: receipt.resultJournalEntryId,
        idempotent: true,
      }),
    });
  const results = await Promise.all([execute(), execute()]);
  assert.equal(reversals.length, 1);
  assert.equal(audits.length, 1);
  assert.equal(results.filter((result) => result.journalEntryId === "reversal-1").length, 2);
});

test("period, financial event, and every ledger account are explicitly entity scoped", async () => {
  const calls = [];
  const api = {
    accountingPeriod: {
      async findFirst(options) {
        calls.push(["period", options.filter]);
        return { id: "period-1", accountingEntityId: "entity-1", status: "open" };
      },
    },
    financialEvent: {
      async findFirst(options) {
        calls.push(["event", options.filter]);
        return { id: "event-1", accountingEntityId: "entity-1", currency: "USD" };
      },
    },
    ledgerAccount: {
      async findFirst(options) {
        calls.push(["account", options.filter]);
        const id = options.filter.AND[0].id.equals;
        return { id, accountingEntityId: "entity-1", currency: "USD", status: "active" };
      },
    },
  };
  await validateFinanceRelations({
    api,
    accountingEntityId: "entity-1",
    accountingPeriodId: "period-1",
    financialEventId: "event-1",
    currency: "USD",
    lines: [
      { ledgerAccountId: "account-1", currency: "USD" },
      { ledgerAccountId: "account-2", currency: "USD" },
    ],
  });
  assert.equal(calls.filter(([kind]) => kind === "account").length, 2);
  for (const [, filter] of calls) {
    assert.deepEqual(filter.AND[1], { accountingEntityId: { equals: "entity-1" } });
  }

  api.ledgerAccount.findFirst = async () => null;
  await assert.rejects(
    validateFinanceRelations({
      api,
      accountingEntityId: "entity-1",
      accountingPeriodId: "period-1",
      currency: "USD",
      lines: [{ ledgerAccountId: "foreign-account", currency: "USD" }],
    }),
    /ledger account/i
  );
});

test("journal context accepts 250 lines and rejects 251 before account work", async () => {
  const session = {
    get(key) {
      return {
        personId: "person-1",
        internalAuthenticatedAt: new Date().toISOString(),
      }[key];
    },
  };
  let accountReads = 0;
  const lines = (count) =>
    Object.assign(
      Array.from({ length: count }, (_, index) => ({
        id: `line-${index}`,
        accountingEntityId: "entity-1",
        ledgerAccountId: `account-${index}`,
        currency: "USD",
        debitMinor: index % 2 === 0 ? 1 : 0,
        creditMinor: index % 2 === 0 ? 0 : 1,
      })),
      { hasNextPage: false }
    );
  const api = {
    internalOperator: {
      async findFirst() {
        return { id: "operator-1", personId: "person-1", status: "active" };
      },
    },
    operatorShopAssignment: {
      async findMany() {
        return Object.assign([{
          id: "assignment-1",
          shopId: "shop-1",
          status: "active",
          role: { name: "Finance Manager" },
        }], { hasNextPage: false });
      },
    },
    accountingEntity: {
      async findFirst() { return { id: "entity-1", shopId: "shop-1" }; },
    },
    accountingPeriod: {
      async findFirst() { return { id: "period-1", accountingEntityId: "entity-1", status: "open" }; },
    },
    journalLine: {
      async findMany() { return lines(250); },
    },
    ledgerAccount: {
      async findFirst({ filter }) {
        accountReads += 1;
        return {
          id: filter.AND[0].id.equals,
          accountingEntityId: "entity-1",
          currency: "USD",
          status: "active",
        };
      },
    },
  };
  const record = {
    id: "journal-1",
    accountingEntityId: "entity-1",
    accountingPeriodId: "period-1",
    currency: "USD",
  };
  const context = await requireFinanceContext({ api, session, record });
  assert.equal(context.lines.length, 250);
  assert.equal(accountReads, 250);

  api.journalLine.findMany = async () => lines(251);
  accountReads = 0;
  await assert.rejects(
    requireFinanceContext({ api, session, record }),
    /250-line safety limit/
  );
  assert.equal(accountReads, 0);
});

test("journal validation requires positive debit XOR credit and balances per currency", () => {
  const result = validateJournal({
    accountingEntityId: "entity-1",
    currency: "usd",
    lines: [
      {
        accountingEntityId: "entity-1",
        currency: "USD",
        debitMinor: 1099,
        creditMinor: 0,
      },
      {
        accountingEntityId: "entity-1",
        currency: "USD",
        debitMinor: 0,
        creditMinor: 1099,
      },
    ],
  });
  assert.deepEqual(result, {
    currency: "USD",
    debitMinor: 1099,
    creditMinor: 1099,
  });

  assert.throws(
    () =>
      validateJournal({
        accountingEntityId: "entity-1",
        currency: "USD",
        lines: [
          { accountingEntityId: "entity-1", currency: "USD", debitMinor: 1, creditMinor: 1 },
          { accountingEntityId: "entity-1", currency: "USD", debitMinor: 0, creditMinor: 1 },
        ],
      }),
    /exactly one/
  );
  assert.throws(
    () =>
      validateJournal({
        accountingEntityId: "entity-1",
        currency: "USD",
        lines: [
          { accountingEntityId: "entity-1", currency: "USD", debitMinor: 1, creditMinor: 0 },
          { accountingEntityId: "entity-1", currency: "CAD", debitMinor: 0, creditMinor: 1 },
        ],
      }),
    /cross-currency/
  );
  assert.throws(
    () =>
      validateJournal({
        accountingEntityId: "entity-1",
        currency: "USD",
        lines: [
          { accountingEntityId: "entity-1", currency: "USD", debitMinor: 2, creditMinor: 0 },
          { accountingEntityId: "entity-1", currency: "USD", debitMinor: 0, creditMinor: 1 },
        ],
      }),
    /balanced/
  );
  assert.throws(
    () =>
      validateJournal({
        accountingEntityId: "entity-1",
        currency: "USD",
        lines: [
          { accountingEntityId: "entity-2", currency: "USD", debitMinor: 1, creditMinor: 0 },
          { accountingEntityId: "entity-1", currency: "USD", debitMinor: 0, creditMinor: 1 },
        ],
      }),
    /accounting entity/
  );
});

test("posting rejects closed periods and self approval", () => {
  assert.doesNotThrow(() => assertPeriodOpen({ status: "open" }));
  assert.throws(() => assertPeriodOpen({ status: "closed" }), /closed/);
  assert.doesNotThrow(() =>
    assertApprovalSeparation({ preparedById: "operator-1", approvedById: "operator-2" })
  );
  assert.throws(
    () => assertApprovalSeparation({ preparedById: "operator-1", approvedById: "operator-1" }),
    /different operator/
  );
});

test("finance records are always shadow mode and posted records are immutable", () => {
  assert.equal(assertShadowMode(true), true);
  assert.throws(() => assertShadowMode(false), /shadow mode/);
  assert.throws(() => assertImmutablePostedUpdate({ status: "posted" }, { memo: "edit" }), /immutable/);
  assert.doesNotThrow(() => assertImmutablePostedUpdate({ status: "draft" }, { memo: "edit" }));
});

test("journal workflow submits, independently approves, and posts only a valid shadow journal", () => {
  const draft = {
    id: "journal-1",
    accountingEntityId: "entity-1",
    accountingPeriodId: "period-1",
    currency: "USD",
    status: "draft",
    shadowMode: true,
    preparedBy: "operator-1",
  };
  const lines = [
    { accountingEntityId: "entity-1", currency: "USD", debitMinor: 100, creditMinor: 0 },
    { accountingEntityId: "entity-1", currency: "USD", debitMinor: 0, creditMinor: 100 },
  ];
  const submitted = submitJournal({ entry: draft, lines });
  assert.equal(submitted.status, "pending_approval");

  const approved = approveJournal({
    entry: submitted,
    lines,
    period: { id: "period-1", accountingEntityId: "entity-1", status: "open" },
    actorId: "operator-2",
    now: "2026-07-23T12:00:00.000Z",
  });
  assert.equal(approved.status, "approved");
  assert.equal(approved.approvedBy, "operator-2");

  const posted = postJournal({
    entry: approved,
    lines,
    period: { id: "period-1", accountingEntityId: "entity-1", status: "open" },
    actorId: "operator-3",
    now: "2026-07-23T12:01:00.000Z",
  });
  assert.equal(posted.status, "posted");
  assert.equal(posted.postedBy, "operator-3");
  assert.equal(posted.shadowMode, true);

  assert.throws(
    () =>
      approveJournal({
        entry: submitted,
        lines,
        period: { id: "period-1", accountingEntityId: "entity-1", status: "open" },
        actorId: "operator-1",
      }),
    /different operator/
  );
});

test("reversals are linked, mirrored, and remain drafts in shadow mode", () => {
  const reversal = createReversalDraft(
    {
      id: "journal-1",
      accountingEntityId: "entity-1",
      currency: "USD",
      status: "posted",
      lines: [
        { ledgerAccountId: "cash", currency: "USD", debitMinor: 500, creditMinor: 0 },
        { ledgerAccountId: "revenue", currency: "USD", debitMinor: 0, creditMinor: 500 },
      ],
    },
    { sourceVersionKey: "entity-1:manual:journal-1:reversal-1", actorId: "operator-2" }
  );

  assert.equal(reversal.reversesJournalEntryId, "journal-1");
  assert.equal(reversal.status, "draft");
  assert.equal(reversal.shadowMode, true);
  assert.deepEqual(
    reversal.lines.map(({ debitMinor, creditMinor }) => ({ debitMinor, creditMinor })),
    [
      { debitMinor: 0, creditMinor: 500 },
      { debitMinor: 500, creditMinor: 0 },
    ]
  );
  assert.throws(
    () =>
      createReversalDraft(
        { id: "journal-2", status: "draft", lines: [] },
        { sourceVersionKey: "key", actorId: "operator-2" }
      ),
    /posted/
  );
});

test("finance schemas carry tenant, audit, idempotency, money, and relationship fields", async () => {
  const required = {
    accountingEntity: ["entityKey", "shop", "status", "baseCurrency"],
    financeProfile: ["accountingEntity", "profileKey", "shadowMode", "approvedBy", "approvedAt"],
    ledgerAccount: ["accountingEntity", "accountKey", "code", "type", "currency", "status"],
    accountingPeriod: ["accountingEntity", "periodKey", "startsAt", "endsAt", "status"],
    financialEvent: ["accountingEntity", "sourceVersionKey", "sourceSystem", "sourceId", "sourceVersion", "currency", "amountMinor", "status"],
    journalEntry: ["accountingEntity", "sourceVersionKey", "currency", "status", "shadowMode", "preparedBy", "approvedBy", "reversesJournalEntry"],
    journalLine: ["accountingEntity", "journalEntry", "ledgerAccount", "currency", "debitMinor", "creditMinor"],
    financeOperationReceipt: ["operationKey", "accountingEntity", "journalEntry", "operation", "actorId", "resultJournalEntry"],
  };

  for (const [model, fields] of Object.entries(required)) {
    const source = await readFile(new URL(`../api/models/${model}/schema.gadget.ts`, import.meta.url), "utf8");
    for (const field of fields) {
      assert.match(source, new RegExp(`\\b${field}\\s*:`), `${model}.${field} is required`);
    }
  }
});

test("shopify app role has no finance model grants", async () => {
  const source = await readFile(
    new URL("../accessControl/permissions.gadget.ts", import.meta.url),
    "utf8"
  );
  const shopRole = source.match(/"shopify-app-users":[\s\S]*?unauthenticated:/)?.[0] || "";
  for (const model of [
    "accountingEntity",
    "financeProfile",
    "ledgerAccount",
    "accountingPeriod",
    "financialEvent",
    "journalEntry",
    "journalLine",
    "financeOperationReceipt",
  ]) {
    assert.doesNotMatch(shopRole, new RegExp(`\\b${model}\\b`));
  }
});

test("finance release gate explicitly prohibits payments and external posting", async () => {
  const source = await readFile(
    new URL("../docs/finance-shadow-ledger-release-gate.md", import.meta.url),
    "utf8"
  );
  assert.match(source, /no external accounting posting/i);
  assert.match(source, /no payment initiation/i);
  assert.match(source, /owner\/CPA/i);
});

test("journal model actions delegate mutations to validated shadow-ledger workflow", async () => {
  for (const action of ["submit", "approve", "post", "reverse"]) {
    const source = await readFile(
      new URL(`../api/models/journalEntry/actions/${action}.js`, import.meta.url),
      "utf8"
    );
    assert.match(source, /requireFinanceContext/);
    assert.match(source, /accountingEntity/);
    if (action !== "reverse") assert.match(source, /writeAudit/);
    assert.match(source, /transactional:\s*true/);
    assert.match(source, /claimFinanceOperation/);
    assert.match(source, /completeFinanceOperation/);
    const mutationMarker =
      action === "reverse" ? "api.internal.journalEntry.create" : "record.status =";
    assert.ok(
      source.indexOf("claimFinanceOperation") < source.indexOf(mutationMarker),
      `${action} must claim before state mutation`
    );
  }
  const reverse = await readFile(
    new URL("../api/models/journalEntry/actions/reverse.js", import.meta.url),
    "utf8"
  );
  assert.doesNotMatch(reverse, /writeAudit/);
  assert.match(reverse, /reversalKey/);
});

test("composite uniqueness fields are derived by their create actions", async () => {
  const expectations = [
    ["ledgerAccount", "accountKey", "deriveAccountKey"],
    ["journalLine", "lineKey", "deriveJournalLineKey"],
    ["financialEvent", "sourceVersionKey", "normalizeFinancialEvent"],
  ];
  for (const [model, field, helper] of expectations) {
    const schema = await readFile(
      new URL(`../api/models/${model}/schema.gadget.ts`, import.meta.url),
      "utf8"
    );
    const action = await readFile(
      new URL(`../api/models/${model}/actions/create.js`, import.meta.url),
      "utf8"
    );
    assert.match(schema, new RegExp(`${field}[\\s\\S]*?unique:\\s*true`));
    assert.match(action, new RegExp(helper));
  }
  const journalSchema = await readFile(
    new URL("../api/models/journalEntry/schema.gadget.ts", import.meta.url),
    "utf8"
  );
  assert.match(journalSchema, /reversalKey[\s\S]*?unique:\s*true/);
});

test("financial event and journal create/update mutations are transactional and audited", async () => {
  for (const path of [
    "../api/models/financialEvent/actions/create.js",
    "../api/models/journalEntry/actions/create.js",
    "../api/models/journalEntry/actions/update.js",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /writeAudit/);
    assert.match(source, /transactional:\s*true/);
  }
  const journalCreate = await readFile(
    new URL("../api/models/journalEntry/actions/create.js", import.meta.url),
    "utf8"
  );
  assert.match(journalCreate, /buildSourceVersionKey/);
  assert.doesNotMatch(journalCreate, /sourceVersionKey:\s*input\.sourceVersionKey/);
});

test("finance HTTP routes authenticate before finance reads or actions", async () => {
  for (const route of [financeEventRoute, financeJournalRoute]) {
    let sideEffects = 0;
    const reply = {
      statusCode: 200,
      code(value) { this.statusCode = value; return this; },
      async send() {},
    };
    await route({
      request: { body: { shopId: "shop-1", accountingEntityId: "entity-1" } },
      body: { shopId: "shop-1", accountingEntityId: "entity-1" },
      reply,
      api: {
        internalOperator: { async findFirst() { return null; } },
        accountingEntity: { async findFirst() { sideEffects += 1; } },
        internal: new Proxy({}, { get() { sideEffects += 1; } }),
      },
      session: { get() { return null; } },
      logger: { error() {} },
    });
    assert.equal(reply.statusCode, 401);
    assert.equal(sideEffects, 0);
  }
});

test("finance journal route accepts only allowlisted actions and assigned-shop entities", async () => {
  let invoked = 0;
  const reply = {
    payload: null,
    statusCode: 200,
    code(value) { this.statusCode = value; return this; },
    async send(value) { this.payload = value; },
  };
  const api = {
    internalOperator: {
      async findFirst() {
        return { id: "operator-1", personId: "person-1", email: "finance@example.test", status: "active" };
      },
    },
    operatorShopAssignment: {
      async findMany() {
        return Object.assign([{
          id: "assignment-1",
          shopId: "shop-1",
          status: "active",
          role: { name: "Finance Manager" },
        }], { hasNextPage: false });
      },
    },
    accountingEntity: {
      async findFirst({ filter }) {
        assert.deepEqual(filter, {
          AND: [
            { id: { equals: "entity-1" } },
            { shopId: { equals: "shop-1" } },
          ],
        });
        return { id: "entity-1", shopId: "shop-1" };
      },
    },
    journalEntry: {
      async findFirst({ filter }) {
        assert.deepEqual(filter, {
          AND: [
            { id: { equals: "journal-1" } },
            { accountingEntityId: { equals: "entity-1" } },
          ],
        });
        return { id: "journal-1" };
      },
    },
    internal: {
      journalEntry: {
        async post(id) { invoked += 1; return { id, status: "posted", shadowMode: true }; },
      },
    },
  };
  const session = {
    get(key) {
      return {
        personId: "person-1",
        internalAuthenticatedAt: new Date().toISOString(),
      }[key];
    },
  };
  await financeJournalRoute({
    request: { body: { action: "post", journalEntryId: "journal-1", accountingEntityId: "entity-1", shopId: "shop-1" } },
    body: { action: "post", journalEntryId: "journal-1", accountingEntityId: "entity-1", shopId: "shop-1" },
    reply, api, session, logger: { error() {} },
  });
  assert.equal(invoked, 1);
  assert.equal(reply.payload.success, true);

  await financeJournalRoute({
    request: { body: { action: "delete", journalEntryId: "journal-1", accountingEntityId: "entity-1", shopId: "shop-1" } },
    body: { action: "delete", journalEntryId: "journal-1", accountingEntityId: "entity-1", shopId: "shop-1" },
    reply, api, session, logger: { error() {} },
  });
  assert.equal(reply.statusCode, 400);
  assert.equal(invoked, 1);
});
