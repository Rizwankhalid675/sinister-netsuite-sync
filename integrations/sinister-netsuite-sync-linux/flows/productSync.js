const { getInventoryItems, updateInventoryItem, createInventoryItem, getItemIdBySku } = require('../netsuite');
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
      Offset: offset,
      Miva_Request_Timestamp: Math.floor(Date.now() / 1000),
      // Only fetch active products — Miva's admin "Active" filter (689 products),
      // not the full catalog including inactive/discontinued items (8161 total).
      Filter: [{ name: 'search', value: [{ field: 'product_active', operator: 'EQ', value: '1' }] }]
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

// Cross-check active Miva SKUs against NetSuite and auto-create any that are missing.
async function syncNewMivaSkus() {
  log('Checking for new Miva SKUs not yet in NetSuite...');
  const mivaProducts = await getMivaProducts();

  const activeProducts = mivaProducts.filter(p => {
    // Miva ProductList_Load_Query returns 0/1 (or boolean) for `active`
    return p.active === undefined || p.active === true || p.active === 1 || p.active === '1';
  });
  log(`Found ${activeProducts.length} active Miva product(s) (of ${mivaProducts.length} total)`);

  const nsItems = await getInventoryItems();
  const existingSkus = new Set(nsItems.map(i => (i.itemid || '').toLowerCase()));

  let created = 0;
  let skipped = 0;
  const failures = [];

  for (const p of activeProducts) {
    const sku = p.code || p.sku;
    if (!sku) { skipped++; continue; }

    if (existingSkus.has(sku.toLowerCase())) {
      skipped++;
      continue;
    }

    try {
      // Double-check directly against NetSuite in case our bulk list was stale
      const existingId = await getItemIdBySku(sku);
      if (existingId) {
        skipped++;
        continue;
      }

      const name = p.name || p.descrip || sku;
      // Price must come from Miva's own `price` field (the real Miva selling price).
      // Do NOT hardcode or fall back to a default — if Miva has no price on the
      // product, skip creation rather than push a $0 item into NetSuite.
      if (p.price === undefined || p.price === null || p.price === '') {
        log(`⚠️ Skipping new NetSuite item for Miva SKU "${sku}" — no price set in Miva`, 'error');
        skipped++;
        failures.push(sku);
        continue;
      }
      const price = Number(p.price);

      const newId = await createInventoryItem(sku, name, price);
      log(`✅ Created NetSuite item for new Miva SKU "${sku}" (NetSuite id ${newId})`);

      if (newId) {
        await updateInventoryItem(newId, p.id, p.code || sku);
      }

      created++;
      existingSkus.add(sku.toLowerCase());
    } catch (err) {
      log(`❌ Failed to create NetSuite item for SKU "${sku}": ${err.message}`, 'error');
      failures.push(sku);
    }
  }

  log(`New SKU sync complete — ${created} created, ${skipped} already existed/skipped${failures.length ? `, ${failures.length} failed` : ''}`);
  return { created, skipped, failures };
}

module.exports = { syncProductIds, syncNewMivaSkus, getMivaProducts };
