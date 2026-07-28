const {
  createCustomerDeposit,
  nsRequest,
  suiteQL,
  getSalesOrderFinancialSummary,
  getTransactionsByExternalId,
} = require('../netsuite');
const { assertTotalsMatch, moneyToCents } = require('../lib/orderMapping');
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

function validTransactionId(value) {
  return value && value !== 'unknown' ? String(value) : null;
}

function requireUniqueTransaction(rows, recordType, externalId) {
  if (rows.length > 1) throw new Error(`Multiple ${recordType} transactions match external ID ${externalId}`);
  return rows.length === 1 ? String(rows[0].id) : null;
}

async function ensureOrderReconciled(order, syncState, dependencies = {}) {
  if (!syncState?.netsuiteId) throw new Error(`No NetSuite order found for Miva order ${order.id}`);
  if (syncState.reconciled === true) return syncState;

  const getSummary = dependencies.getSalesOrderFinancialSummary || getSalesOrderFinancialSummary;
  const summary = await getSummary(syncState.netsuiteId);
  assertTotalsMatch(order.total, summary.total);
  const reconciledState = {
    ...syncState,
    reconciled: true,
    reconciliation: {
      ...(syncState.reconciliation || {}),
      mivaTotalCents: moneyToCents(order.total),
      netsuiteTotalCents: moneyToCents(summary.total),
    },
  };
  const persist = dependencies.saveOrderState || ((id, state) => saveSynced(SYNCED_FILE, id, state));
  persist(order.id, reconciledState);
  return reconciledState;
}

async function syncInvoiceForOrder(order, dependencies = {}) {
  const syncState = await ensureOrderReconciled(order, dependencies.syncState, dependencies);
  const nsOrderId = String(syncState.netsuiteId);
  let invoiceState = { ...(dependencies.invoiceState || {}) };
  const persist = dependencies.saveInvoiceState || ((id, state) => saveSynced(INVOICED_FILE, id, state));
  const lookup = dependencies.getTransactionsByExternalId || getTransactionsByExternalId;
  const trandate = order.orderdate
    ? new Date(order.orderdate * 1000).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];

  let depositId = validTransactionId(invoiceState.depositId);
  let invoiceId = validTransactionId(invoiceState.invoiceId);
  if (!depositId || !invoiceId) {
    const getStatus = dependencies.getSalesOrderStatus || (async (id) => {
      const rows = await suiteQL(`SELECT status FROM transaction WHERE id = ${Number(id)}`);
      return rows[0]?.status;
    });
    const soStatus = await getStatus(nsOrderId);
    if (soStatus !== 'E' && soStatus !== 'F') {
      return { status: 'waiting', depositId, invoiceId, nsOrderId };
    }
  }

  const depositExternalId = `MIVA_CD_${order.id}`;
  if (!depositId) {
    depositId = requireUniqueTransaction(
      await lookup(depositExternalId, 'customerdeposit'),
      'customerdeposit',
      depositExternalId
    );
    if (!depositId) {
      const createDeposit = dependencies.createCustomerDeposit || createCustomerDeposit;
      try {
        const deposit = await createDeposit({
          salesOrder: { id: nsOrderId },
          payment: order.total,
          undepfunds: true,
          currency: { id: '1' },
          trandate,
          memo: `Deposit for Miva Order #${order.id}`,
          externalid: depositExternalId,
        });
        depositId = validTransactionId(deposit?.id);
        if (!depositId) throw new Error('NetSuite did not return a customer deposit ID');
      } catch (error) {
        depositId = requireUniqueTransaction(
          await lookup(depositExternalId, 'customerdeposit'),
          'customerdeposit',
          depositExternalId
        );
        if (!depositId) throw error;
      }
    }
    invoiceState = { ...invoiceState, depositId, nsOrderId };
    persist(order.id, invoiceState);
  }

  const invoiceExternalId = `MIVA_INV_${order.id}`;
  if (!invoiceId) {
    invoiceId = requireUniqueTransaction(
      await lookup(invoiceExternalId, 'invoice'),
      'invoice',
      invoiceExternalId
    );
    if (!invoiceId) {
      const createInvoiceFromSalesOrder = dependencies.createInvoiceFromSalesOrder || ((id, data) => (
        nsRequest('POST', `salesorder/${id}/!transform/invoice`, data)
      ));
      try {
        const invoice = await createInvoiceFromSalesOrder(nsOrderId, {
          trandate,
          externalid: invoiceExternalId,
        });
        invoiceId = validTransactionId(invoice?.id);
        if (!invoiceId) throw new Error('NetSuite did not return an invoice ID');
      } catch (error) {
        invoiceId = requireUniqueTransaction(
          await lookup(invoiceExternalId, 'invoice'),
          'invoice',
          invoiceExternalId
        );
        if (!invoiceId) throw error;
      }
    }
    invoiceState = { ...invoiceState, depositId, invoiceId, nsOrderId };
    persist(order.id, invoiceState);
  }

  if (depositId && invoiceId) {
    const applyDeposit = dependencies.applyDeposit || ((deposit, invoice) => (
      nsRequest('POST', `customerdeposit/${deposit}/!transform/depositapplication`, {
        trandate,
        apply: { items: [{ doc: invoice, apply: true }] },
      })
    ));
    await applyDeposit(depositId, invoiceId);
  }

  return { status: 'complete', depositId, invoiceId, nsOrderId };
}

async function syncInvoices(orders) {
  const synced = loadSynced(SYNCED_FILE);
  const invoiced = loadSynced(INVOICED_FILE);

  for (const order of orders) {
    try {
      const result = await syncInvoiceForOrder(order, {
        syncState: synced[order.id],
        invoiceState: invoiced[order.id],
      });
      if (result.status === 'waiting') {
        log(`SO ${result.nsOrderId} is not ready for invoicing`);
      } else {
        log(`Accounting transactions for Miva order ${order.id} are checkpointed`);
      }
    } catch (error) {
      log(`Deposit/invoice blocked for Order ${order.id}: ${error.message}`, 'error');
    }
  }
}

module.exports = {
  syncInvoices,
  syncInvoiceForOrder,
  ensureOrderReconciled,
  requireUniqueTransaction,
};
