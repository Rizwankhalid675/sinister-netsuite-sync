# Miva Itemized Order Parity Go/No-Go Report

**Date:** 2026-07-28  
**Branch:** `agent/miva-itemized-order-parity`  
**Decision:** **NO-GO** for merge, controlled live test, and PM2 restart.

## Blocking finding

The read-only reference dry run resolved all required item IDs and totals, but NetSuite item 10322 reported tax schedule 2. Miva order 2766295 contains protection tax, so schedule 1 is required. The dry run correctly returned `ready: false` and exited 1. No NetSuite master data was changed.

An authorized NetSuite administrator must review item 10322. This branch must remain no-go until the item reports schedule 1, the complete read-only validation passes, a newly created controlled Miva test order reconciles exactly, and duplicate prevention is verified on its second invocation.

## Investigation and commands executed

Commands were executed in the isolated standalone checkout. Credential values and customer data were never printed.

```powershell
git fetch origin
git switch agent/miva-itemized-order-parity
git status --short --branch
git log --oneline --decorate -12
git diff --check
npm ci
node --test test/*.test.js
node --check flows/ordersToNetsuite.js
node --check flows/invoices.js
node --check netsuite.js
node --check scripts/dry-run-order-parity.js
node --test test/orderMapping.test.js
node --test test/netsuiteQueries.test.js
node --test test/ordersToNetsuite.test.js test/orderMapping.test.js
node --test test/invoices.test.js test/orderMapping.test.js test/netsuiteQueries.test.js
node --test test/dryRunOrderParity.test.js test/miva.test.js
node scripts/dry-run-order-parity.js 2766295
```

The final dry-run command used credentials loaded into the process from an existing ignored environment file. The file was not copied, printed, or committed.

## Automated test results

- Dependency installation: exit 0; 107 packages installed from lockfile.
- npm audit summary from installation: 3 known dependency vulnerabilities (2 moderate, 1 high); no automatic or breaking upgrade was applied.
- Full local suite before the external dry run: 32 tests passed, 0 failed, 0 skipped.
- Required JavaScript syntax checks: all exited 0.
- PM2 status: unavailable on this Windows host because PM2 is not installed. Linux process state remains unverified.

## Read-only dry-run results

| SKU/charge | NetSuite ID | Amount cents | Result |
| --- | ---: | ---: | --- |
| `SD-ARP-HEAD-6.0` | 13609 | 84599 | exact |
| `SD-IGK-FORD-03` | 2317 | 9000 | exact |
| `FD-EG-KIT` | 13573 | 11744 | exact |
| `FD-6.0-20` | 13132 | 23940 | exact |
| Enhanced Shipping Protection | 10322 | 2586 | item/amount exact; tax schedule blocked |

| Total | Cents | Result |
| --- | ---: | --- |
| Product subtotal | 129283 | exact |
| Shipping | 0 | exact |
| Tax | 10219 | exact |
| Protection | 2586 | exact |
| Order total | 142088 | exact |

Protection item current schedule: 2. Required schedule: 1. Final readiness: `false`.

## Issues fixed on the branch

- Financial comparisons now require exact integer-cent equality; the former one-cent tolerance was removed.
- Explicit SKU overrides must resolve read-only to the expected active NetSuite item metadata.
- NetSuite-side sales-order discovery adopts one existing order and blocks ambiguous matches before customer creation.
- Created/adopted sales-order IDs are checkpointed before financial reconciliation.
- Historical tracking records without `reconciled` are compared against NetSuite totals lazily and are trusted only after exact equality.
- Deposits and invoices are discovered by deterministic external ID, block ambiguity, recover safely after HTTP 400 responses, and checkpoint IDs immediately.
- The reference dry run uses an exact Miva order-ID filter and returns a top-level readiness gate.

## Runtime tracking compatibility

The inspected runtime contained 381 sales-order tracking records, and all 381 lacked `reconciled`. The new lazy rule does not assume they are valid and does not permanently block valid records: each record must compare exactly against its corresponding NetSuite sales-order total before accounting proceeds. No tracking file was modified, deleted, cleared, or copied.

## Changed files

- `docs/superpowers/specs/2026-07-28-miva-itemized-order-parity-design.md`
- `docs/superpowers/plans/2026-07-28-miva-itemized-order-parity.md`
- `lib/orderMapping.js`
- `netsuite.js`
- `miva.js`
- `flows/ordersToNetsuite.js`
- `flows/invoices.js`
- `scripts/dry-run-order-parity.js`
- `test/orderMapping.test.js`
- `test/netsuiteQueries.test.js`
- `test/ordersToNetsuite.test.js`
- `test/invoices.test.js`
- `test/miva.test.js`
- `test/dryRunOrderParity.test.js`
- `docs/validation/miva-itemized-order-live-test.md`
- `docs/validation/miva-itemized-order-go-no-go.md`

## Actions not performed

- No Miva mutation.
- No NetSuite transaction or master-data mutation.
- No live replay of order 2766295.
- No full synchronization-service run.
- No customer creation.
- No deposit or invoice creation.
- No tracking-file deletion or reset.
- No PM2 stop, start, restart, or configuration change.
- No merge to `main` and no push.

## Rollback procedure

Keep PM2 unchanged. Revert the feature commits in reverse order on the feature branch or redeploy the previously approved commit. Run `npm ci` against the restored lockfile. Preserve all tracking files. If a future controlled test creates a transaction, record its ID and require a NetSuite administrator to void or correct it; never delete it automatically. Rerun the prior version's tests and syntax checks before any approved deployment or restart.

## Final decisions

- Safe to merge: **NO**.
- Safe to restart production PM2: **NO**.
- Safe to conduct a controlled live test: **NO** until item 10322 uses schedule 1 and the dry run reports `ready: true`.
