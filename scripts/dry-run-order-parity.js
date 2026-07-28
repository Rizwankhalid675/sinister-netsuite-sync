require('dotenv').config();
const { getOrders } = require('../miva');
const { getItemsBySku, getItemMetadata } = require('../netsuite');
const { expandMivaItems, validateMivaOrderTotals, resolveExpandedLines, buildNetsuiteLines } = require('../lib/orderMapping');

const ORDER_OVERRIDES = { 'SD-ARP-HEAD-6.0': '13609' };

async function main() {
  const orderId = String(process.argv[2] || '');
  if (!/^\d+$/.test(orderId)) throw new Error('Usage: node scripts/dry-run-order-parity.js <miva-order-id>');
  const lookbackStart = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  const orders = await getOrders({ startDate: lookbackStart, batchSize: 100 });
  const order = orders.find((candidate) => String(candidate.id) === orderId);
  if (!order) throw new Error(`Miva order ${orderId} was not found`);
  const expanded = expandMivaItems(order);
  const totals = validateMivaOrderTotals(order, expanded);
  const resolved = await resolveExpandedLines(expanded, getItemsBySku, ORDER_OVERRIDES);
  const lines = buildNetsuiteLines(resolved, order);
  const protectionItem = await getItemMetadata('10322');
  const expectedProtectionTaxable = (order.charges || []).some(
    (charge) => charge.type === 'enshield_charge' && Number(charge.tax || 0) > 0
  );
  console.log(JSON.stringify({
    mode: 'READ_ONLY_DRY_RUN',
    orderId,
    lines: lines.map((line) => ({
      itemId: line.item.id,
      mivaLineId: line.custcol_hb_miva_order_line_id || null,
      description: line.description,
      quantity: line.quantity,
      rate: line.rate,
      amount: line.amount,
      taxable: line.taxcode.id === '12260',
    })),
    totals: {
      product: totals.productCents / 100,
      charges: totals.chargeCents / 100,
      order: totals.orderCents / 100,
      tax: Number(order.total_tax || 0),
    },
    protectionItem: {
      id: protectionItem?.id,
      name: protectionItem?.itemid,
      currentTaxSchedule: protectionItem?.taxschedule,
      requiredTaxSchedule: expectedProtectionTaxable ? '1' : protectionItem?.taxschedule,
      ready: !expectedProtectionTaxable || String(protectionItem?.taxschedule) === '1',
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(`DRY RUN FAILED: ${error.message}`);
  process.exitCode = 1;
});
