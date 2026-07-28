const { getInventoryItems, updateInventoryItem } = require('../netsuite');
const { log } = require('../logger');
const axios = require('axios');

const MIVA_URL = process.env.MIVA_STORE_URL;
const MIVA_TOKEN = process.env.MIVA_API_TOKEN;
const MIVA_STORE = process.env.MIVA_STORE_CODE;

async function getMivaProducts() {
  const PAGE_SIZE = 500;
  let offset = 0;
  let all = [];

  while (true) {
    const response = await axios.post(MIVA_URL, {
      Store_Code: MIVA_STORE,
      Function: 'ProductList_Load_Query',
      Count: PAGE_SIZE,
      Offset: offset
    }, {
      headers: { 'X-Miva-API-Authorization': `MIVA ${MIVA_TOKEN}` }
    });

    const page = response.data.data?.data || [];
    const totalCount = response.data.data?.total_count ?? page.length;
    all = all.concat(page);

    if (page.length === 0 || all.length >= totalCount) break;
    offset += PAGE_SIZE;
  }

  return all;
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
  const unmatched = [];

  for (const nsItem of nsItems) {
    const key = (nsItem.itemid || '').toLowerCase();
    const match = mivaMap[key];

    if (!match) {
      unmatched.push(nsItem.itemid);
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

  if (unmatched.length) {
    log(`No Miva match for ${unmatched.length} NetSuite item(s) — skipping: ${unmatched.slice(0, 20).join(', ')}${unmatched.length > 20 ? `, … (+${unmatched.length - 20} more)` : ''}`);
  }

  log(`Product sync complete — ${updated} updated, ${skipped} skipped`);
}

module.exports = { syncProductIds };
