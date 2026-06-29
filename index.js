require('dotenv').config();
const cron = require('node-cron');
const { syncOrdersToNetsuite } = require('./flows/ordersToNetsuite');
const { syncShipmentsToMiva } = require('./flows/shipmentsToMiva');
const { syncInvoices } = require('./flows/invoices');
const { syncProductIds } = require('./flows/productSync');
const { syncCustomersToNetsuite } = require('./flows/customersToNetsuite');
const { getOrders } = require('./miva');
const { log } = require('./logger');

const INTERVAL = process.env.SYNC_INTERVAL_MINUTES || 5;

let syncRunning = false;

async function runSync() {
  if (syncRunning) {
    log('Previous sync still running — skipping this tick');
    return;
  }
  syncRunning = true;
  log('═══════════════════════════════════════');
  log('Sinister Diesel → NetSuite Sync Started');

  try {
    // Flow 1: Miva Orders → NetSuite Sales Orders
    log('Running Flow 1: Orders → NetSuite...');
    await syncOrdersToNetsuite();

    // Flow 2: NetSuite Shipments → Miva
    log('Running Flow 2: Shipments → Miva...');
    await syncShipmentsToMiva();

    // Flow 3: Customer Deposits / Invoices
    log('Running Flow 3: Invoices / Deposits...');
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const orders = await getOrders({ startDate: since });
    await syncInvoices(orders);

    // Flow 4: Product ID Sync
    log('Running Flow 4: Product ID Sync...');
    await syncProductIds();

    // Flow 5: Miva Customers → NetSuite
    log('Running Flow 5: Customers → NetSuite...');
    await syncCustomersToNetsuite();

    log('✅ All flows completed successfully');
  } catch (err) {
    log(`❌ Sync error: ${err.message}`, 'error');
  } finally {
    syncRunning = false;
  }

  log('═══════════════════════════════════════');
}

// Run immediately on start
runSync();

// Then run every X minutes
cron.schedule(`*/${INTERVAL} * * * *`, () => {
  runSync();
});

log(`Scheduler running — syncing every ${INTERVAL} minutes`);
