require('dotenv').config();
const cron = require('node-cron');
const { syncOrdersToNetsuite } = require('./flows/ordersToNetsuite');
const { syncShipmentsToMiva } = require('./flows/shipmentsToMiva');
const { syncInvoices } = require('./flows/invoices');
const { syncProductIds, syncNewMivaSkus } = require('./flows/productSync');
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

let newSkuSyncRunning = false;

async function runNewSkuSync() {
  if (newSkuSyncRunning) {
    log('Previous new-SKU sync still running — skipping this tick');
    return;
  }
  newSkuSyncRunning = true;
  log('═══════════════════════════════════════');
  log('Running Flow 6: New Miva SKU → NetSuite auto-create...');
  try {
    await syncNewMivaSkus();
  } catch (err) {
    log(`❌ New SKU sync error: ${err.message}`, 'error');
  } finally {
    newSkuSyncRunning = false;
  }
  log('═══════════════════════════════════════');
}

// Run immediately on start
runSync();
runNewSkuSync();

// Then run every X minutes
cron.schedule(`*/${INTERVAL} * * * *`, () => {
  runSync();
});

// New-SKU cross-check runs every 12 hours (new products don't need 5-minute polling)
cron.schedule('0 */12 * * *', () => {
  runNewSkuSync();
});

log(`Scheduler running — syncing every ${INTERVAL} minutes, new-SKU check every 12 hours`);
