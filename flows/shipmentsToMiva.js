const { getFulfilledOrders } = require('../netsuite');
const { log } = require('../logger');
const fs = require('fs');
const path = require('path');
const axios = require('axios');

const SYNCED_FILE = path.join(__dirname, '../logs/synced_orders.json');
const MIVA_URL = process.env.MIVA_STORE_URL;
const MIVA_TOKEN = process.env.MIVA_API_TOKEN;
const MIVA_STORE = process.env.MIVA_STORE_CODE;

function getSyncedOrders() {
  if (!fs.existsSync(SYNCED_FILE)) return {};
  return JSON.parse(fs.readFileSync(SYNCED_FILE, 'utf8'));
}

function saveSyncedOrder(mivaOrderId, data) {
  const synced = getSyncedOrders();
  synced[mivaOrderId] = { ...synced[mivaOrderId], ...data, updatedAt: new Date().toISOString() };
  fs.writeFileSync(SYNCED_FILE, JSON.stringify(synced, null, 2));
}

async function mivaRequest(body) {
  const response = await axios.post(MIVA_URL, body, {
    headers: { 'X-Miva-API-Authorization': `MIVA ${MIVA_TOKEN}` }
  });
  return response.data;
}

// Step 1: Create shipment in Miva (Add)
async function addMivaShipment(mivaOrderId, lineIds) {
  const result = await mivaRequest({
    Store_Code: MIVA_STORE,
    Function: 'OrderItemList_CreateShipment',
    Miva_Request_Timestamp: Math.floor(Date.now() / 1000),
    Order_Id: Number(mivaOrderId),
    Line_IDs: lineIds.map(Number)
  });
  return result?.data?.id || result?.data?.shpmnt_id || result?.id || null;
}

const CARRIER_MAP = { 'UPS': 'UPS', 'FedEx/USPS/More': 'USPS' };

// Step 2: Update Miva shipment with tracking info
async function updateMivaShipment(mivaOrderId, shipmentId, trackingNum, shipCarrier) {
  // Multi-package shipments return tracking numbers joined with <BR> — use only first
  const cleanTracking = (trackingNum || '').split(/<br>/i)[0].trim();
  const cleanCarrier = CARRIER_MAP[shipCarrier] || '';

  await mivaRequest({
    Store_Code: MIVA_STORE,
    Function: 'OrderShipmentList_Update',
    Shipment_Updates: [{
      shpmnt_id: Number(shipmentId),
      mark_shipped: true,
      tracknum: cleanTracking,
      tracktype: cleanCarrier
    }]
  });
}

async function syncShipmentsToMiva() {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const fulfilledOrders = await getFulfilledOrders(since);
  const synced = getSyncedOrders();

  log(`Found ${fulfilledOrders.length} fulfilled NetSuite orders to check`);

  for (const nsOrder of fulfilledOrders) {
    // Order_Id is the Miva order ID stored in custbody_hb_miva_order_id
    const mivaOrderId = String(nsOrder.Order_Id || '');

    if (!mivaOrderId) {
      log(`NetSuite IF ${nsOrder.id} has no Miva order ID — skipping`);
      continue;
    }

    if (!nsOrder.TrackingNum) {
      log(`Miva order ${mivaOrderId} has no tracking number yet — skipping`);
      continue;
    }

    if (synced[mivaOrderId]?.mivaShipmentId) {
      log(`Miva order ${mivaOrderId} already has shipment — skipping`);
      continue;
    }

    try {
      // Step 1: Get Miva order line IDs
      const mivaOrderDetails = await mivaRequest({
        Store_Code: MIVA_STORE,
        Function: 'OrderList_Load_Query',
        Count: 1,
        Miva_Request_Timestamp: Math.floor(Date.now() / 1000),
        Filter: [
          { name: 'ondemandcolumns', value: ['items'] },
          { name: 'search', value: [{ field: 'id', operator: 'EQ', value: String(mivaOrderId) }] }
        ]
      });
      const mivaOrder = (mivaOrderDetails.data?.data || mivaOrderDetails.data || [])[0];
      const items = mivaOrder?.items || [];

      // Skip if all lines already have a shipment in Miva
      if (items.length && items.every(i => i.shpmnt_id)) {
        log(`Miva order ${mivaOrderId} already shipped in Miva — skipping`);
        saveSyncedOrder(mivaOrderId, { mivaShipmentId: items[0].shpmnt_id });
        continue;
      }

      const lineIds = items.filter(i => !i.shpmnt_id).map(i => i.line_id).filter(Boolean);

      if (!lineIds.length) {
        log(`No unshipped line IDs found for Miva order ${mivaOrderId} — skipping`);
        continue;
      }

      // Step 2: Add shipment
      const mivaShipmentId = await addMivaShipment(mivaOrderId, lineIds);

      if (!mivaShipmentId) {
        log(`Failed to create Miva shipment for order ${mivaOrderId}`, 'error');
        continue;
      }

      // Step 3: Update with tracking
      await updateMivaShipment(mivaOrderId, mivaShipmentId, nsOrder.TrackingNum, nsOrder.ShipCarrier);

      saveSyncedOrder(mivaOrderId, { mivaShipmentId });
      log(`✅ Shipment synced: Miva Order ${mivaOrderId} → Shipment ${mivaShipmentId} | Tracking: ${nsOrder.TrackingNum}`);
    } catch (err) {
      log(`❌ Shipment sync failed for Miva Order ${mivaOrderId}: ${err.message}`, 'error');
    }
  }
}

module.exports = { syncShipmentsToMiva };
