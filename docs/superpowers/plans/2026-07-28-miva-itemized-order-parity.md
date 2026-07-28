# Miva Itemized Order Parity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make itemized Miva kit-order synchronization exact, idempotent, backward compatible, and safe to validate without replaying reference order 2766295.

**Architecture:** Pure cent-based mapping and reconciliation remain in `lib/orderMapping.js`; `netsuite.js` provides narrowly scoped read-only transaction/item lookups; the order and invoice flows use dependency-injected helpers for duplicate discovery, legacy reconciliation, and checkpoint persistence. The dry-run script aggregates every read-only condition into a top-level `ready` gate, while live synchronization remains a separately approved operational procedure.

**Tech Stack:** Node.js 24, CommonJS, `node:test`, Axios, OAuth 1.0a, SuiteQL, PM2 configuration preserved unchanged.

## Global Constraints

- Never print, commit, or expose credentials or customer data.
- Do not modify Miva or NetSuite during investigation or dry-run validation.
- Do not run `node index.js`, `npm start`, or the full production synchronization service.
- Do not delete, clear, replace, or bulk-rewrite tracking files.
- Never replay Miva order 2766295 as a live order.
- Use integer cents and require exact equality for financial comparisons.
- Reject missing or ambiguous NetSuite SKU and transaction matches.
- Preserve Linux paths, PM2 configuration, process names, and scheduler behavior.
- Do not merge to `main`, restart PM2, or perform a live test without explicit approval.
- Do not create a deposit or invoice until its sales order has reconciled exactly.

---

### Task 1: Establish the immutable validation baseline

**Files:**
- Inspect: `package.json`
- Inspect: `package-lock.json`
- Inspect: `ecosystem.config.js`
- Inspect: `index.js`
- Inspect: `flows/ordersToNetsuite.js`
- Inspect: `flows/invoices.js`
- Inspect: `lib/orderMapping.js`
- Inspect: `netsuite.js`
- Inspect: `scripts/dry-run-order-parity.js`
- Inspect: `test/orderMapping.test.js`

**Interfaces:**
- Consumes: clean feature branch at commit `4102d8f` or its reviewed descendant.
- Produces: recorded command output and a dependency baseline; no runtime writes.

- [ ] **Step 1: Confirm branch, worktree, and history**

Run:

```powershell
git status --short --branch
git log --oneline --decorate -12
git diff --check
```

Expected: branch `agent/miva-itemized-order-parity`; only intentional plan changes; no whitespace errors.

- [ ] **Step 2: Record environment and tracking schemas safely**

List environment variable names only. Report tracking record counts and distinct field-name sets only. Never print values, record keys, order IDs, customer data, or amounts.

Expected legacy finding: historical `synced_orders.json` entries without `reconciled` exist and must not be trusted automatically.

- [ ] **Step 3: Install exactly the locked dependencies**

Run:

```powershell
npm ci
```

Expected: exit 0 and no changes to `package.json` or `package-lock.json`.

- [ ] **Step 4: Run the pre-change test and syntax baseline**

Run:

```powershell
node --test test/*.test.js
node --check flows/ordersToNetsuite.js
node --check flows/invoices.js
node --check netsuite.js
node --check scripts/dry-run-order-parity.js
```

Expected: capture exact pass/fail counts. Known behavior test currently allows a one-cent mismatch and will be replaced in Task 2.

- [ ] **Step 5: Commit no baseline artifacts**

Run `git status --short`. Do not add `node_modules`, `.env`, logs, or tracking files.

---

### Task 2: Enforce exact cent reconciliation and verified overrides

**Files:**
- Modify: `lib/orderMapping.js`
- Modify: `test/orderMapping.test.js`

**Interfaces:**
- Consumes: Miva monetary values as numbers or numeric strings and lookup functions returning NetSuite item rows.
- Produces: `moneyToCents(value): number`, `assertTotalsMatch(mivaTotal, netsuiteTotal): true`, and `resolveExpandedLines(lines, lookup, overrides, lookupById): Promise<ResolvedLine[]>` where every override is verified against its expected SKU.

- [ ] **Step 1: Write failing exact-total tests**

Replace the tolerance test with:

```js
test('requires exact post-create total equality in integer cents', () => {
  assert.doesNotThrow(() => assertTotalsMatch(1420.88, 1420.88));
  assert.throws(() => assertTotalsMatch(1420.88, 1420.87), /does not reconcile/i);
  assert.throws(() => assertTotalsMatch(1420.88, 1420.89), /does not reconcile/i);
});
```

Add item- and order-level assertions proving a one-cent expansion mismatch fails rather than passes.

- [ ] **Step 2: Write failing override-verification tests**

Test that override `SD-ARP-HEAD-6.0 -> 13609` succeeds only when `lookupById('13609')` returns exactly one active item whose normalized `itemid` is `SD-ARP-HEAD-6.0`. Test missing, mismatched, and multiple metadata rows as hard failures.

- [ ] **Step 3: Run focused tests and confirm failure**

Run:

```powershell
node --test --test-name-pattern="exact|override|one-cent" test/orderMapping.test.js
```

Expected: failures show the existing one-cent tolerance and unverified override behavior.

- [ ] **Step 4: Implement zero-tolerance comparisons**

Change all three reconciliation conditions from `Math.abs(expected - actual) > 1` to strict integer-cent inequality:

```js
if (expected !== actual) throw new Error(/* redacted diagnostic */);
```

Implement `assertTotalsMatch` as:

```js
if (moneyToCents(mivaTotal) !== moneyToCents(netsuiteTotal)) {
  throw new Error(`NetSuite total does not reconcile with Miva total`);
}
return true;
```

The error must not contain customer data.

- [ ] **Step 5: Verify override IDs read-only inside resolution**

Extend `resolveExpandedLines` with a `lookupById` dependency. For an override, require one metadata row, normalize punctuation/case using `buildItemSkuCandidates`, and require the metadata `itemid` to match one candidate. Store the verified row ID only after this check. Normal SKU lookup retains the exact-one-match rule.

- [ ] **Step 6: Run mapping tests**

Run:

```powershell
node --test test/orderMapping.test.js
```

Expected: all mapping tests pass.

- [ ] **Step 7: Commit the independently testable mapping change**

```powershell
git add lib/orderMapping.js test/orderMapping.test.js
git commit -m "fix: require exact verified item reconciliation"
```

---

### Task 3: Add read-only NetSuite duplicate-discovery interfaces

**Files:**
- Modify: `netsuite.js`
- Create: `test/netsuiteQueries.test.js`

**Interfaces:**
- Produces: `getTransactionsByMivaOrderId(orderId): Promise<TransactionRow[]>`, `getTransactionsByExternalId(externalId, recordType): Promise<TransactionRow[]>`, and `getItemsByInternalId(id): Promise<ItemRow[]>`.
- Transaction rows contain only `id`, `recordtype`, `externalid`, and `foreigntotal`/`total` needed by callers.

- [ ] **Step 1: Write failing query-builder tests**

Extract pure builders so tests can assert escaped string literals and numeric validation without calling NetSuite:

```js
buildMivaOrderLookupQuery('2766295')
buildExternalIdLookupQuery("MIVA_INV_42", 'invoice')
buildItemIdLookupQuery('10322')
```

Tests reject non-numeric internal IDs and unsupported record types. External IDs are escaped by doubling single quotes.

- [ ] **Step 2: Run focused tests and confirm failure**

```powershell
node --test test/netsuiteQueries.test.js
```

Expected: failure because the builders and lookup exports do not exist.

- [ ] **Step 3: Implement narrow SuiteQL lookups**

Use `suiteQL` with exact predicates:

```sql
WHERE custbody_hb_miva_order_id = '<escaped-id>' AND recordtype = 'salesorder'
WHERE externalid = '<escaped-id>' AND recordtype = '<allowlisted-type>'
WHERE id = <validated-integer> AND isinactive = 'F'
```

Do not log queries or responses. Return every match so the flow can reject ambiguity.

- [ ] **Step 4: Run query and syntax tests**

```powershell
node --test test/netsuiteQueries.test.js
node --check netsuite.js
```

Expected: all pass.

- [ ] **Step 5: Commit**

```powershell
git add netsuite.js test/netsuiteQueries.test.js
git commit -m "feat: add read-only transaction duplicate lookups"
```

---

### Task 4: Make sales-order synchronization idempotent and checkpointed

**Files:**
- Modify: `flows/ordersToNetsuite.js`
- Create: `test/ordersToNetsuite.test.js`

**Interfaces:**
- Consumes: `getTransactionsByMivaOrderId`, `getSalesOrderFinancialSummary`, exact mapping helpers, and an injected `saveSyncState`.
- Produces: `syncSingleOrder(order, dependencies): Promise<{ status, netsuiteId, reconciled }>` for unit testing and use by `syncOrdersToNetsuite`.

- [ ] **Step 1: Write failing duplicate and ordering tests**

Cover these call sequences with spies:

```text
tracked order -> skip, no NetSuite or customer calls
one existing NetSuite SO -> adopt, compare exact cents, save, no customer/create calls
multiple existing SOs -> block, no customer/create/save calls
no existing SO + invalid SKU/tax/total -> block before customer resolution
no existing SO + valid order -> resolve customer, create once, save ID with reconciled=false, read summary, save reconciled=true
created SO + total mismatch -> retain saved ID with reconciled=false and throw/block
```

- [ ] **Step 2: Run focused test and confirm failure**

```powershell
node --test test/ordersToNetsuite.test.js
```

- [ ] **Step 3: Refactor one-order orchestration with dependency injection**

Implement `syncSingleOrder` so validation and duplicate lookup precede `ensureCustomer`. When adopting one existing SO, use its ID and financial summary; never call `createSalesOrder`. When creating, save `{ netsuiteId, reconciled: false, reconciliation: { mivaTotalCents, netsuiteTotalCents: null, productCents } }` immediately after receiving the ID, then update the same record after the summary comparison.

Keep the outer loop's existing per-order error isolation and redacted logging. Preserve `SYNCED_FILE`, Linux-relative paths, shipping mappings, custom form, sales rep, and tax/location IDs.

- [ ] **Step 4: Pass verified override metadata into preparation**

Call the Task 2 resolution interface with `getItemsByInternalId`; do not accept a bare override without metadata verification.

- [ ] **Step 5: Run order-flow tests and syntax check**

```powershell
node --test test/ordersToNetsuite.test.js test/orderMapping.test.js
node --check flows/ordersToNetsuite.js
```

- [ ] **Step 6: Commit**

```powershell
git add flows/ordersToNetsuite.js test/ordersToNetsuite.test.js
git commit -m "fix: prevent duplicate Miva sales orders"
```

---

### Task 5: Reconcile legacy records and make deposits/invoices retry-safe

**Files:**
- Modify: `flows/invoices.js`
- Create: `test/invoices.test.js`

**Interfaces:**
- Consumes: current Miva order, tracking state, `getSalesOrderFinancialSummary`, `getTransactionsByExternalId`, write functions, and injected `saveSynced`.
- Produces: `ensureOrderReconciled(order, state, dependencies): Promise<state>` and `syncInvoiceForOrder(order, dependencies): Promise<Result>`.

- [ ] **Step 1: Write failing legacy compatibility tests**

Test that a record with no `reconciled`:

- reads its existing sales-order total;
- writes `reconciled: true` only on exact cent equality;
- preserves existing fields;
- remains blocked and unchanged on mismatch, missing order, or invalid totals;
- never creates a deposit or invoice when blocked.

- [ ] **Step 2: Write failing idempotency/checkpoint tests**

Test exact external IDs and these cases:

```text
existing deposit -> adopt, do not POST deposit
multiple deposits -> block
new deposit -> POST once and immediately checkpoint depositId
existing invoice -> adopt, do not transform sales order
multiple invoices -> block
new invoice -> transform once and immediately checkpoint invoiceId
HTTP 400/USER_ERROR -> exact external-ID lookup; adopt one, block zero or multiple
restart after deposit checkpoint -> no second deposit
restart after invoice checkpoint -> no second invoice
```

- [ ] **Step 3: Run tests and confirm failure**

```powershell
node --test test/invoices.test.js
```

- [ ] **Step 4: Implement lazy legacy reconciliation**

For `reconciled !== true`, load the NetSuite summary by the tracked `netsuiteId`, compare with `assertTotalsMatch`, and update that one record with cent fields plus `reconciled: true`. Any failure returns a blocked result and makes no accounting write.

- [ ] **Step 5: Implement deterministic transaction discovery**

Before each write, call `getTransactionsByExternalId`. Require zero or one result. Use `MIVA_CD_<orderId>` for customer deposits and `MIVA_INV_<orderId>` for invoices. More than one result is ambiguous and blocks processing.

- [ ] **Step 6: Persist checkpoints immediately**

After deposit discovery/creation, call `saveSynced` before checking invoice status. After invoice discovery/creation, call `saveSynced` before deposit application. Merge with the prior entry so IDs cannot be lost. Never store `'unknown'` as proof of creation.

- [ ] **Step 7: Run invoice regression tests and syntax check**

```powershell
node --test test/invoices.test.js test/orderMapping.test.js test/netsuiteQueries.test.js
node --check flows/invoices.js
```

- [ ] **Step 8: Commit**

```powershell
git add flows/invoices.js test/invoices.test.js
git commit -m "fix: reconcile legacy orders before accounting"
```

---

### Task 6: Make the reference dry run a complete read-only readiness gate

**Files:**
- Modify: `scripts/dry-run-order-parity.js`
- Create: `test/dryRunOrderParity.test.js`

**Interfaces:**
- Produces: `evaluateOrderParity(order, dependencies): Promise<Report>` and CLI JSON with `mode: 'READ_ONLY_DRY_RUN'`, sanitized lines, cent totals, named checks, and top-level `ready`.

- [ ] **Step 1: Write failing report-contract tests**

Use the local 2766295 fixture and mocked read-only lookups. Require IDs `13609`, `2317`, `13573`, `13132`, `10322`; cents `129283`, `0`, `10219`, `2586`, `142088`; protection schedule `1`; and `ready: true`. Change each expected ID, total, and schedule independently and assert `ready: false`.

- [ ] **Step 2: Test the no-write boundary**

Inject dependencies and assert only Miva order retrieval, SKU lookup, item-ID metadata lookup, and protection metadata lookup are used. The module must not import or call customer, sales-order, deposit, invoice, tracking-write, or scheduler functions.

- [ ] **Step 3: Run test and confirm failure**

```powershell
node --test test/dryRunOrderParity.test.js
```

- [ ] **Step 4: Implement the readiness report**

Return monetary fields in cents, with optional formatted dollar fields for readability. Set:

```js
report.ready = Object.values(report.checks).every(Boolean);
```

The CLI exits non-zero when `ready` is false. Do not include addresses, names, emails, phones, raw Miva payloads, OAuth data, or NetSuite response bodies.

- [ ] **Step 5: Run dry-run unit and syntax tests**

```powershell
node --test test/dryRunOrderParity.test.js
node --check scripts/dry-run-order-parity.js
```

- [ ] **Step 6: Commit**

```powershell
git add scripts/dry-run-order-parity.js test/dryRunOrderParity.test.js
git commit -m "test: gate Miva order parity dry run"
```

---

### Task 7: Execute all read-only validation gates

**Files:**
- Do not modify runtime or tracking files.
- Record results for the final report.

**Interfaces:**
- Consumes: credentials supplied through an existing ignored environment file or process environment without copying or printing values.
- Produces: test, syntax, and sanitized dry-run evidence.

- [ ] **Step 1: Verify the test suite and syntax**

Run exactly:

```powershell
node --test test/*.test.js
node --check flows/ordersToNetsuite.js
node --check flows/invoices.js
node --check netsuite.js
node --check scripts/dry-run-order-parity.js
```

Expected: every test and syntax check exits 0.

- [ ] **Step 2: Run reference order parity read-only**

Make credentials available without copying them into the repository or printing them, then run exactly:

```powershell
node scripts/dry-run-order-parity.js 2766295
```

Expected: `mode=READ_ONLY_DRY_RUN`, the five exact item IDs, the exact expected cent totals, protection schedule 1, and top-level `ready: true`.

- [ ] **Step 3: Apply the tax-schedule hard stop**

If item 10322 reports schedule 2 or anything other than 1 while protection tax is non-zero, stop. Report a no-go blocker. Do not change NetSuite master data.

- [ ] **Step 4: Inspect sanitized logs and worktree**

Search only newly produced test/dry-run output for duplicate blocking, missing/ambiguous SKUs, protection taxation, total mismatch, accounting blocking, unexpected customer-creation calls, and HTTP 400 handling. Run `git status --short` and `git diff --check`.

- [ ] **Step 5: Use verification-before-completion skill**

Re-run the complete command set immediately before making any passing or completion claim.

---

### Task 8: Prepare—but do not execute—the controlled live test

**Files:**
- Create: `docs/validation/miva-itemized-order-live-test.md`

**Interfaces:**
- Produces: administrator runbook with explicit gates and evidence fields; performs no external writes itself.

- [ ] **Step 1: Document prerequisites**

Require a newly created Miva test order, its recorded ID, `ready: true` evidence, an approved maintenance window, a tracking-file backup made without deleting the original, and confirmed PM2 mutual exclusion on the Linux production-adjacent host.

- [ ] **Step 2: Document the one-order invocation**

The runbook must invoke an exported single-order entry point or a dedicated script constrained to the recorded new order ID. It must never run `index.js`, `npm start`, or the cron scheduler and must refuse ID 2766295.

- [ ] **Step 3: Document verification and replay checks**

Record every NetSuite line's item ID, SKU, quantity, cent rate, cent amount, tax code, shipping, tax, and total. Confirm tracking contains the NetSuite ID and `reconciled: true`. Invoke the same single-order command a second time and require an explicit skip/adopt result with no second sales order.

- [ ] **Step 4: Document accounting hold and rollback**

Deposits/invoices remain disabled until a human approves the reconciled sales order. Rollback reverts feature commits and preserves tracking; any created NetSuite transaction is reviewed for administrator void/correction rather than automatically deleted.

- [ ] **Step 5: Commit the runbook**

```powershell
git add docs/validation/miva-itemized-order-live-test.md
git commit -m "docs: add controlled itemized order validation runbook"
```

---

### Task 9: Produce the go/no-go report

**Files:**
- Create: `docs/validation/miva-itemized-order-go-no-go.md`

**Interfaces:**
- Produces: auditable report with no secrets or customer data.

- [ ] **Step 1: Record exact commands and outcomes**

Include every Git, install, test, syntax, and dry-run command executed; exit status; test pass/fail/skip counts; Node/npm versions; and the fact that PM2 validation must occur on Linux if unavailable locally.

- [ ] **Step 2: Record sanitized parity evidence**

Include the five SKU/item-ID mappings, cent totals, protection schedule, and `ready` result. Do not include raw API payloads.

- [ ] **Step 3: Record code and operational status**

List changed files and commits, unresolved blockers, rollback procedure, controlled-live-test status, duplicate-prevention evidence, and any unexpected HTTP 400 behavior.

- [ ] **Step 4: Make conservative decisions**

Report branch safe to merge only if all automated and read-only gates pass, item 10322 uses schedule 1, and the newly created controlled order has reconciled exactly with replay prevention verified. Report PM2 safe to restart only after Linux-host configuration/state validation and explicit approval. Until the controlled live test happens, both decisions are `NO-GO`.

- [ ] **Step 5: Do not commit generated secrets or runtime data**

Run:

```powershell
git status --short
git diff --check
git ls-files .env logs/synced_orders.json logs/synced_invoices.json logs/synced_customers.json
```

Expected: no credential or tracking files are tracked.
