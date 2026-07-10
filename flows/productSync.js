const { getInventoryItems, updateInventoryItem } = require('../netsuite');
const { log } = require('../logger');
const axios = require('axios');

const MIVA_URL = process.env.MIVA_STORE_URL;
const MIVA_TOKEN = process.env.MIVA_API_TOKEN;
const MIVA_STORE = process.env.MIVA_STORE_CODE;

async function getMivaProducts() {
  const response = await axios.post(MIVA_URL, {
    Store_Code: MIVA_STORE,
    Function: 'ProductList_Load_Query',
    Count: 500,
    Offset: 0
  }, {
    headers: { 'X-Miva-API-Authorization': `MIVA ${MIVA_TOKEN}` }
  });
  return response.data.data?.items || [];
}

async function syncProductIds() {
  log('Fetching Miva products...');
  const mivaProducts = await getMivaProducts();
  log(`Found ${mivaProducts.length} Miva products`);

  // Build lookup map: SKU/code → { id, code }
  const mivaMap = {};
  for (const p of mivaProducts) {
    if (p.code) mivaMap[p.code.toLowerCase()] = { id: p.id, code: p.code };
    if (p.sku) mivaMap[p.sku.toLowerCase()] = { id: p.id, code: p.code };
  }

  log('Fetching NetSuite items missing Miva Product ID...');
  const nsItems = await getInventoryItems();
  log(`Found ${nsItems.length} NetSuite items to update`);

  let updated = 0;
  let skipped = 0;

  for (const nsItem of nsItems) {
    const key = (nsItem.itemid || '').toLowerCase();
    const match = mivaMap[key];

    if (!match) {
      log(`No Miva match for NetSuite item "${nsItem.itemid}" — skipping`);
      skipped++;
      continue;
    }

    try {
      await updateInventoryItem(nsItem.id, match.id, match.code);
      log(`✅ Updated NetSuite item ${nsItem.itemid} → Miva ID ${match.id}`);
      updated++;
    } catch (err) {
      log(`❌ Failed to update ${nsItem.itemid}: ${err.message}`, 'error');
    }
  }

  log(`Product sync complete — ${updated} updated, ${skipped} skipped`);
}

module.exports = { syncProductIds };
