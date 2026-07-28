# Controlled Miva Itemized Order Live-Test Runbook

## Current gate

Do not execute this runbook while NetSuite item 10322 uses tax schedule 2 or while the read-only parity report has `ready: false`. A NetSuite administrator must review item 10322 and explicitly approve any master-data change. After an approved change, rerun every read-only test and obtain explicit approval for the controlled live test.

## Prerequisites

- Use the Linux production-adjacent host, not the Windows development checkout.
- Confirm the deployed commit and preserve `ecosystem.config.js` unchanged.
- Confirm `node --test test/*.test.js` and every required syntax check exits 0.
- Confirm `node scripts/dry-run-order-parity.js 2766295` reports `ready: true` and tax schedule 1.
- Create exactly one new Miva test order. Never use order 2766295.
- Record the new Miva order ID in the maintenance record before synchronization.
- Obtain explicit approval for a maintenance window and the one-order NetSuite write.
- Back up tracking files without deleting, clearing, or replacing the originals.
- Confirm PM2 scheduler mutual exclusion. Pause `sinister-diesel-sync` or use an administrator-approved mechanism that prevents concurrent order synchronization.
- Confirm no other operator or deployment is running the order flow.

## One-order execution

Use a reviewed single-order entry point constrained to the recorded new Miva ID. The command must reject ID 2766295. Do not run `node index.js`, `npm start`, `pm2 restart`, or the cron scheduler.

Before invocation, confirm the order is absent from `synced_orders.json` and perform a read-only NetSuite lookup by its Miva order ID. More than one match is an immediate stop. If exactly one match exists, adopt and reconcile it; do not create another sales order.

Invoke the order flow exactly once. Keep invoice/deposit processing disabled.

## Verification worksheet

Record without customer data:

| Line | Miva SKU | NetSuite ID | Quantity | Rate cents | Amount cents | Tax code | Match |
| ---: | --- | ---: | ---: | ---: | ---: | --- | --- |
| 1 |  |  |  |  |  |  |  |

Record shipping, product subtotal, tax, protection, and order total in integer cents. Require exact equality between Miva and NetSuite; a one-cent difference is a failure.

Confirm the one tracking entry contains the NetSuite sales-order ID and `reconciled: true`. Do not expose or copy other tracking entries.

Run the same constrained one-order command a second time. Require a tracked skip or unique NetSuite adoption and prove that no second sales order exists.

## Accounting hold

Do not create a customer deposit or invoice until a human reviewer approves every sales-order line and exact total. After approval, run accounting processing only for the recorded test order. Confirm deterministic external IDs prevent duplicate deposits and invoices.

## Rollback

Stop the controlled invocation and keep the scheduler paused. Revert only the feature commits and reinstall locked dependencies if needed. Never delete tracking files. Preserve every created NetSuite internal ID in the incident/maintenance record. A NetSuite administrator must void or correct an incorrect transaction according to accounting policy; automation must not delete it. Restore PM2 only after the prior code, configuration, and intact tracking files are verified and explicit restart approval is given.
