# Miva Itemized Order Parity Design

## Purpose

Safely synchronize itemized Miva kit orders into NetSuite while preventing duplicate or financially incorrect sales orders, customer deposits, and invoices. Miva order 2766295 is a read-only reference fixture and must never be replayed as a live order.

## Safety boundaries

- Initial and regression validation is read-only against Miva and NetSuite.
- Never run the full production scheduler during validation.
- Never delete, clear, or replace synchronization tracking files.
- Never log credentials, customer data, or complete tracking records.
- Never change NetSuite item master data without explicit administrator approval.
- Never merge to `main` or restart production PM2 without explicit approval.
- A controlled live test uses exactly one newly created Miva test order after all read-only gates pass.
- Deposits and invoices remain blocked until the corresponding sales-order total reconciles exactly.

## Current-state findings

The feature branch expands a Miva kit parent and each price-bearing option into separate NetSuite custom-price lines. It performs exact SKU lookups, adds Enhanced Shipping Protection as NetSuite item 10322, checks item 10322's tax schedule when Miva reports protection tax, records a created sales-order ID before reporting a mismatch, and requires `reconciled: true` before downstream accounting.

The production-adjacent runtime tracking file contains 381 sales-order records and none includes the `reconciled` field. Therefore, the current invoice guard blocks every historical record indefinitely. The current total comparison also permits a one-cent variance, while this feature requires exact cent equality. Local tracking alone does not fully protect against duplication after a crash, tracking-file loss, or a partially completed transaction.

## Architecture

Keep pure monetary and item-mapping behavior in `lib/orderMapping.js`. All financial values are converted to integer cents before validation or comparison. `flows/ordersToNetsuite.js` orchestrates read-only duplicate discovery, exact item resolution, customer resolution, sales-order creation or adoption, and reconciliation-state persistence. `flows/invoices.js` performs lazy reconciliation for legacy tracking records and discovers existing deposits and invoices by deterministic identifiers before any create operation. `netsuite.js` owns read-only SuiteQL lookup functions and write wrappers.

## Item expansion and resolution

For each Miva item, produce one parent line plus one line for every option with a non-zero price. Each expanded line carries its SKU, quantity, integer-cent rate and amount, tax status, description, and original Miva line ID.

Zero-price selected options remain visible in the parent line description so Amanda can review the complete Miva configuration without creating artificial zero-dollar NetSuite inventory lines. Every price-bearing option becomes its own NetSuite item line with the resolved SKU, quantity, custom rate, custom amount, and Miva line ID. The reference kit must therefore display its $845.99 parent plus the $90.00, $117.44, and $239.40 component lines, followed by the $25.86 protection line.

Each line must resolve to exactly one active NetSuite item. Candidate normalization may account for the known underscore-to-period and case variation, but a lookup that returns multiple active items is ambiguous and blocks the order. A missing match also blocks the order. A configured override is allowed only for an explicitly reviewed SKU-to-internal-ID mapping and must be verified read-only against NetSuite metadata before the dry run reports ready.

For reference order 2766295, the required resolution is:

| Miva SKU | NetSuite ID | Amount (cents) |
| --- | ---: | ---: |
| `SD-ARP-HEAD-6.0` | 13609 | 84599 |
| `SD-IGK-FORD-03` | 2317 | 9000 |
| `FD-EG-KIT` | 13573 | 11744 |
| `FD-6.0-20` | 13132 | 23940 |
| Enhanced Shipping Protection | 10322 | 2586 |

The product subtotal must equal 129283 cents, shipping 0 cents, tax 10219 cents, and order total 142088 cents.

## Protection taxation gate

When Miva reports non-zero protection tax, read NetSuite item 10322 and require tax schedule 1. If its schedule is not 1, the dry run reports `ready: false`, all live testing stops, and an administrator must decide whether to change master data. The sync code never modifies the item.

## Exact financial reconciliation

All comparisons use integer cents. Expanded lines must exactly equal each Miva item total. Product lines plus order charges must exactly equal the Miva order total. After creation or adoption, the NetSuite sales-order total must exactly equal the Miva order total. No one-cent tolerance is permitted.

The saved sales-order state contains the NetSuite ID, `reconciled`, reconciliation totals in cents, and a timestamp. The NetSuite ID is persisted even when reconciliation fails so a later cycle cannot create another order.

## Manual approval and preserved business sequence

The service preserves the existing flow order: Miva order intake, NetSuite customer resolution and sales-order creation, NetSuite fulfillment updates back to Miva, then deposit/invoice processing. Product and customer maintenance flows remain after the financial sequence.

Every new NetSuite sales order is created in Pending Approval status (`orderstatus` internal ID `A`). The integration never approves, rejects, or changes that status automatically. Amanda retains the existing Approve and Cancel Order controls in NetSuite and performs the business review manually.

Deposit and invoice processing requires exact reconciliation and a NetSuite status eligible for post-approval billing. A Pending Approval order cannot produce an invoice. The controlled validation must prove both that the sales order initially exposes the Approve action and that no accounting transaction is created before manual approval and fulfillment.

## Duplicate prevention

Before creating a sales order, query NetSuite for transactions whose Miva-order custom field matches the Miva order ID:

- Zero matches: creation may proceed after all other validation passes.
- One match: adopt that NetSuite ID, compare totals, and save the resulting reconciliation state without creating another sales order.
- More than one match: block as ambiguous and make no write.

Customer resolution happens only after item, tax, total, and duplicate checks pass. This prevents unexpected customer creation for an order that should have been rejected or adopted.

Deposits and invoices use deterministic external IDs (`MIVA_CD_<orderId>` and `MIVA_INV_<orderId>`). Before creating either transaction, query NetSuite for the external ID. Adopt exactly one existing result, create only when no result exists, and block on ambiguity. Persist a discovered or newly created deposit ID immediately before attempting invoice work. Persist a discovered or newly created invoice ID immediately before deposit application. This makes retries idempotent across process failures.

## Legacy reconciliation

An old tracking record without `reconciled: true` is neither trusted nor permanently rejected. When invoice processing sees such a record, it reads the existing NetSuite sales-order total and compares it with the current Miva total in cents:

- Exact match: update only that tracking entry to `reconciled: true`, record cent totals, and allow downstream processing.
- Mismatch, missing NetSuite order, invalid totals, or ambiguous lookup: keep downstream accounting blocked and log a redacted reason.

This migration is lazy and bounded to orders already supplied to the invoice flow. It never assumes reconciliation, does not bulk-edit tracking records, and preserves existing fields.

## Dry-run contract

`node scripts/dry-run-order-parity.js 2766295` performs only Miva reads and NetSuite reads. Its structured output contains sanitized line resolution, cent-based totals, item 10322 tax-schedule status, individual checks, and a top-level `ready` boolean. `ready` is true only if:

- all five expected NetSuite item IDs resolve exactly;
- product, shipping, tax, protection, and order totals equal the expected cents;
- the expanded Miva order reconciles exactly;
- NetSuite item 10322 uses schedule 1 when Miva reports protection tax.

No customer lookup or creation, sales-order creation, deposit creation, invoice creation, tracking-file write, or scheduler invocation occurs during the dry run.

## Testing

Unit tests cover exact cents, itemized kit expansion, missing and ambiguous SKU rejection, override verification, item 10322 taxation, zero-tolerance total comparison, existing sales-order adoption, multiple-sales-order rejection, legacy reconciliation success and failure, deposit and invoice adoption, immediate checkpoint persistence, and handling of NetSuite HTTP 400 responses without duplicate retries.

Syntax checks cover both flows, `netsuite.js`, and the dry-run script. The required read-only dry run is executed only after dependencies are installed and credentials are made available without copying, printing, or committing them.

## Controlled live-test gate

Live testing requires a new Miva test order and explicit approval after every read-only check passes and the dry run reports `ready: true`. Record the new Miva ID, pause the production PM2 scheduler or otherwise guarantee mutual exclusion, invoke only the order flow once, verify every NetSuite line and exact total, verify `synced_orders.json` has the NetSuite ID and `reconciled: true`, then invoke the same order flow again and verify it skips the order. Do not create a deposit or invoice until this inspection succeeds.

## Rollback

Code rollback consists of stopping the controlled invocation, reverting only this feature's commits, reinstalling dependencies from the restored lockfile if it changed, and redeploying without deleting tracking data. If a controlled test created a valid but incorrect NetSuite transaction, do not delete it automatically; record its IDs and have a NetSuite administrator void or correct it according to accounting policy. Restore PM2 only after verifying the previous code, configuration, and intact tracking files.
