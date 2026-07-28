const { createCustomerDeposit, nsRequest, suiteQL } = require('../netsuite');
const { log } = require('../logger');
const fs = require('fs');
const path = require('path');

const SYNCED_FILE = path.join(__dirname, '../logs/synced_orders.json');
const INVOICED_FILE = path.join(__dirname, '../logs/synced_invoices.json');

function loadSynced(file) {
  if (!fs.existsSync(file)) return {};
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveSynced(file, key, data) {
  const existing = loadSynced(file);
  existing[key] = { ...data, syncedAt: new Date().toISOString() };
  fs.writeFileSync(file, JSON.stringify(existing, null, 2));
}

async function syncInvoices(orders) {
  const synced = loadSynced(SYNCED_FILE);
  const invoiced = loadSynced(INVOICED_FILE);

  for (const order of orders) {
    const existing = invoiced[order.id];
    if (existing?.invoiceId && existing.invoiceId !== 'unknown') {
      log(`Invoice for order ${order.id} already created — skipping`);
      continue;
    }

    const nsOrderId = synced[order.id]?.netsuiteId;
    if (!nsOrderId) {
      log(`No NetSuite order found for Miva order ${order.id} — skipping invoice`);
      continue;
    }

    const trandate = order.orderdate
      ? new Date(order.orderdate * 1000).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    try {
      // Create deposit only if not already done
      let depositId = existing?.depositId;
      if (!depositId || depositId === 'unknown') {
        const depositData = {
          salesOrder: { id: nsOrderId },
          payment: order.total,
          undepfunds: true,
          currency: { id: '1' },
          trandate,
          memo: `Deposit for Miva Order #${order.id}`,
          externalid: `MIVA_CD_${order.id}`
        };
        const deposit = await createCustomerDeposit(depositData);
        depositId = deposit?.id || 'unknown';
        log(`✅ Customer deposit created for Order ${order.id} → Deposit ${depositId}`);
      }

      // Invoice — only possible after SO is approved (status B = Pending Fulfillment)
      let invoiceId = existing?.invoiceId || 'unknown';
      if (invoiceId === 'unknown') {
        const soRows = await suiteQL(`SELECT status FROM transaction WHERE id = ${nsOrderId}`);
        const soStatus = soRows[0]?.status;
        // Only invoice after order is approved AND fulfilled (status E or F = Pending Billing)
        if (soStatus === 'E' || soStatus === 'F') {
          try {
            const inv = await nsRequest('POST', `salesorder/${nsOrderId}/!transform/invoice`, {
              trandate,
              externalid: `MIVA_INV_${order.id}`
            });
            invoiceId = inv?.id || 'unknown';
            log(`✅ Invoice created for Order ${order.id} → Invoice ${invoiceId}`);

            // Apply deposit to invoice to close it
            if (invoiceId && invoiceId !== 'unknown' && depositId && depositId !== 'unknown') {
              try {
                await nsRequest('POST', `customerdeposit/${depositId}/!transform/depositapplication`, {
                  trandate,
                  apply: { items: [{ doc: invoiceId, apply: true }] }
                });
                log(`✅ Deposit ${depositId} applied to Invoice ${invoiceId} — invoice closed`);
              } catch (applyErr) {
                log(`⚠️ Could not apply deposit to invoice for Order ${order.id}: ${applyErr.message}`, 'error');
              }
            }
          } catch (invErr) {
            // NS returns 400 with USER_ERROR when deposit auto-application fails but invoice IS still created
            if (invErr.message.includes('automatic application of the deposit') || invErr.message.includes('USER_ERROR')) {
              // Look up the invoice by externalid since NS created it despite the error
              try {
                const invRows = await suiteQL(`SELECT id FROM transaction WHERE externalid = 'MIVA_INV_${order.id}' AND recordtype = 'invoice'`);
                invoiceId = invRows[0]?.id || 'unknown';
                log(`✅ Invoice created for Order ${order.id} → Invoice ${invoiceId} (looked up after NS USER_ERROR)`);
              } catch (lookupErr) {
                log(`⚠️ Could not look up invoice for Order ${order.id}: ${lookupErr.message}`, 'error');
                invoiceId = 'unknown';
              }

              // Now apply deposit to close the invoice
              if (invoiceId && invoiceId !== 'unknown' && depositId && depositId !== 'unknown') {
                try {
                  await nsRequest('POST', `customerdeposit/${depositId}/!transform/depositapplication`, {
                    trandate,
                    apply: { items: [{ doc: invoiceId, apply: true }] }
                  });
                  log(`✅ Deposit ${depositId} applied to Invoice ${invoiceId} — invoice closed`);
                } catch (applyErr) {
                  log(`⚠️ Could not apply deposit to invoice for Order ${order.id}: ${applyErr.message}`, 'error');
                }
              }
            } else {
              log(`⚠️ Invoice creation failed for Order ${order.id}: ${invErr.message}`, 'error');
            }
          }
        } else {
          log(`SO ${nsOrderId} status=${soStatus} — invoice will be created after approval and fulfillment`);
        }
      }

      saveSynced(INVOICED_FILE, order.id, { depositId, invoiceId, nsOrderId });
    } catch (err) {
      log(`❌ Deposit/invoice failed for Order ${order.id}: ${err.message}`, 'error');
    }
  }
}

module.exports = { syncInvoices };
