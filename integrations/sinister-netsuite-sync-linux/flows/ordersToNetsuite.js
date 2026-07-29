const { getOrders } = require('../miva');
const { createSalesOrder, getCustomerByEmail, getItemIdBySku, createInventoryItem, nsRequest } = require('../netsuite');
const { upsertNSCustomer } = require('./customersToNetsuite');
const { getMivaProducts } = require('./productSync');
const { log } = require('../logger');
const fs = require('fs');
const path = require('path');
const {
  expandMivaItems,
  validateMivaOrderTotals,
  resolveExpandedLines,
  buildNetsuiteLines,
  assertProtectionItemTaxable,
} = require('../lib/orderMapping');

const SYNCED_FILE = path.join(__dirname, '../logs/synced_orders.json');
const MISSING_SKUS_FILE = path.join(__dirname, '../logs/missing_skus.json');

// Cache of currently-live (purchasable) Miva SKUs for this run, so we only
// match/auto-create NetSuite items for SKUs that are actually active on the
// website — not arbitrary/legacy codes that happen to appear on an order.
let _liveSkuSetCache = null;
async function getLiveSkuSet() {
  if (_liveSkuSetCache) return _liveSkuSetCache;
  const products = await getMivaProducts();
  const active = products.filter(p => {
    // Miva ProductList_Load_Query returns 0/1 (or boolean) for `active`
    return p.active === undefined || p.active === true || p.active === 1 || p.active === '1';
  });
  const set = new Set();
  for (const p of active) {
    if (p.code) set.add(p.code.toLowerCase());
    if (p.sku) set.add(p.sku.toLowerCase());
  }
  _liveSkuSetCache = set;
  log(`Loaded ${set.size} live Miva SKU(s) for order-sync validation`);
  return set;
}

function loadSyncedOrders() {
  if (!fs.existsSync(SYNCED_FILE)) return {};
  return JSON.parse(fs.readFileSync(SYNCED_FILE, 'utf8'));
}

function saveSyncedOrder(mivaOrderId, netsuiteId) {
  const synced = loadSyncedOrders();
  synced[mivaOrderId] = { netsuiteId, syncedAt: new Date().toISOString() };
  fs.writeFileSync(SYNCED_FILE, JSON.stringify(synced, null, 2));
}

function loadMissingSkus() {
  if (!fs.existsSync(MISSING_SKUS_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(MISSING_SKUS_FILE, 'utf8'));
  } catch {
    return {};
  }
}

// Accumulates unresolved SKUs across a sync run instead of logging one line per SKU.
// Persisted to logs/missing_skus.json so nothing is lost between runs and it can be reviewed/fixed in bulk.
function recordMissingSku(sku, itemName, orderId) {
  const all = loadMissingSkus();
  if (!all[sku]) {
    all[sku] = { name: itemName || '', firstSeen: new Date().toISOString(), orders: [] };
  }
  if (!all[sku].orders.includes(orderId)) all[sku].orders.push(orderId);
  all[sku].lastSeen = new Date().toISOString();
  fs.writeFileSync(MISSING_SKUS_FILE, JSON.stringify(all, null, 2));
}

const SHIP_METHOD_MAP = {
  'Free Shipping': 10325,
  'UPS&reg; Ground': 8297,
  'UPS 2nd Day Air&reg;': 8298,
  'UPS Next Day Air&reg;': 8299,
  'UPS 3 Day Select&reg;': 8300,
  'U.S.P.S. Priority Mail&reg;': 9316,
  'Will Call &#40;Pick up at Sinister Roseville, CA&#41;': 12147
};

// Celigo hardcoded SKU overrides — SKUs where Miva code doesn't match NS item name exactly
// NOTE: These internal IDs were re-verified against live NetSuite (SuiteQL) on 2026-07-28.
// Several had drifted from item re-creation/renumbering in NetSuite; IDs below are current.
// TODO: 'SD-COOLFIL-6_0-W' and 'SD-6_0CF03-01-20' have no matching NetSuite itemid at all
// anymore (old id 8210 was a shared/guessed fallback) — needs manual lookup of the correct
// current item before these two SKUs can sync reliably. Left as-is (8210) pending investigation.
const SKU_OVERRIDES = {
  'SD-UFC-OIL': '7952',
  'SD-RADTUBE-6.7C-19-HO': '11533',
  'SD-RADTUBE-6.7C-19': '11532',
  'SD-FC-FUEL-U-GRN': '11412',
  'SDG-CAI-6.0': '11573',
  'SD-FC-FUEL-U': '11411',
  'SD-FC-FUEL-U-GRY': '11413',
  'SD-REOFCF-6.0': '11538',
  'SD-COOLFIL-6_0-W': '8210',
  'SD-6_0CF03-01-20': '8210'
};

// Builds the base parent-item description the same way the old code did
// (used only as a fallback inside expandMivaItems' default description logic
// via item.name — attribute/option descriptions come from attr_prompt/opt_prompt).
function describeParentItem(item) {
  const sku = item.sku || item.code || '';
  const isBlemish = sku.toLowerCase().includes('-blem') || (item.name || '').toLowerCase().includes('blemish');
  return isBlemish ? sku : (item.name || sku);
}

async function mapOrderToNetsuite(order, customerId, itemIdMap = {}) {
  // Normalize item.sku so expandMivaItems/lib always has a SKU to key off,
  // and override parent descriptions to preserve blemish-SKU-as-description
  // behavior from the previous implementation.
  const normalizedOrder = {
    ...order,
    items: (order.items || []).map(item => ({
      ...item,
      sku: item.sku || item.code,
      name: describeParentItem(item),
    })),
  };

  const expanded = expandMivaItems(normalizedOrder);
  validateMivaOrderTotals(normalizedOrder, expanded);

  // itemIdMap was already resolved by SKU (including overrides/blemish/auto-create)
  // by the caller — feed it in as overrides so resolveExpandedLines doesn't need
  // to hit NetSuite again for parent lines. Price-bearing OPTION lines (e.g.
  // Enshield-style attributes) get their own SKU lookup via getItemIdBySku.
  const overrides = {};
  for (const [sku, id] of Object.entries(itemIdMap)) {
    if (id) overrides[sku] = id;
  }

  const lookupBySku = async (candidateSku) => {
    const id = await getItemIdBySku(candidateSku);
    return id ? [{ id }] : [];
  };

  const resolvedLines = await resolveExpandedLines(expanded, lookupBySku, overrides);
  const items = buildNetsuiteLines(resolvedLines, order);

  // buildNetsuiteLines already appends the Enshield protection line using
  // order.charges — verify the tax schedule assumption holds before we ship it.
  const enshield = (order.charges || []).find(c => c.type === 'enshield_charge');
  if (enshield) {
    assertProtectionItemTaxable(order, { taxschedule: '1' });
  }

  const shippingCost = order.total_ship || order.shipping_cost || 0;
  const phone = order.ship_phone || order.bill_phone || '';

  const discount = (order.charges || []).find(c => c.type === 'DISCOUNT' || (c.amount < 0 && c.type !== 'enshield_charge'));

  const payload = {
    shippingAddress: {
      override: false,
      addressee: `${order.ship_fname} ${order.ship_lname}`,
      attention: order.ship_comp || '',
      addr1: order.ship_addr1,
      addr2: order.ship_addr2 || '',
      city: order.ship_city,
      state: order.ship_state,
      zip: order.ship_zip,
      country: { id: order.ship_cntry || 'US' },
      addrPhone: phone
    },
    billingAddress: {
      override: false,
      addressee: `${order.bill_fname} ${order.bill_lname}`,
      attention: order.bill_comp || '',
      addr1: order.bill_addr1,
      addr2: order.bill_addr2 || '',
      city: order.bill_city,
      state: order.bill_state,
      zip: order.bill_zip,
      country: { id: order.bill_cntry || 'US' },
      addrPhone: order.bill_phone || phone
    },
    customForm: { id: '232' },
    trandate: order.orderdate
      ? new Date(order.orderdate * 1000).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0],
    custbody_hb_miva_payment_method: order.payment_module,
    custbody_hb_miva_order_total: order.total,
    custbody_hb_miva_order_id: String(order.id),
    custbody231: phone,
    salesrep: { id: '179371' },
    shipphone: phone,
    billphone: order.bill_phone || phone,
    shippingcost: shippingCost,
    nexus: order.ship_state === 'CA' ? { id: '1' } : undefined,
    shipmethod: SHIP_METHOD_MAP[order.ship_method] ? { id: SHIP_METHOD_MAP[order.ship_method] } : undefined,
    orderstatus: { id: 'A' },
    item: { items }
  };

  // Set header discount fields — NS applies the deduction automatically from discountrate
  if (discount) {
    payload.discountitem = { id: '38' };
    payload.discountrate = Number(discount.amount);
  }

  // Only set entity if we found a matching customer
  if (customerId) payload.entity = { id: customerId };

  return { payload, shippingCost };
}

async function syncOrdersToNetsuite() {
  const synced = loadSyncedOrders();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const orders = await getOrders({ startDate: since });

  log(`Found ${orders.length} orders to check`);

  for (const order of orders) {
    if (synced[order.id]) {
      log(`Order ${order.id} already synced — skipping`);
      continue;
    }

    try {
      const email = order.ship_email || order.cust_pw_email || '';
      let customerId = email ? await getCustomerByEmail(email) : null;

      // Auto-create customer in NetSuite if not found — entity field is required
      if (!customerId) {
        const customerObj = {
          email: email,
          pw_email: email,
          ship_fname: order.ship_fname || order.bill_fname,
          ship_lname: order.ship_lname || order.bill_lname,
          bill_fname: order.bill_fname,
          bill_lname: order.bill_lname,
          ship_phone: order.ship_phone || order.bill_phone,
          bill_phone: order.bill_phone,
          ship_comp: order.ship_comp || order.bill_comp,
          bill_comp: order.bill_comp
        };
        customerId = await upsertNSCustomer(customerObj);
        if (!customerId) {
          log(`❌ Order ${order.id} skipped — could not find or create customer for ${email}`, 'error');
          continue;
        }
      }

      // Resolve NetSuite item IDs by SKU
      const liveSkus = await getLiveSkuSet();
      const itemIdMap = {};
      for (const item of (order.items || [])) {
        const sku = item.sku || item.code;
        if (!sku || itemIdMap[sku] !== undefined) continue;

        // Check hardcoded overrides first (Celigo parity)
        if (SKU_OVERRIDES[sku]) {
          itemIdMap[sku] = SKU_OVERRIDES[sku];
          continue;
        }

        // Blemish items map to a generic blemish NS item
        if (sku.toLowerCase().includes('-blem') || (item.name || '').toLowerCase().includes('blemish')) {
          const blemId = await getItemIdBySku('SD-BLEMISH');
          itemIdMap[sku] = blemId || null;
          continue;
        }

        let id = await getItemIdBySku(sku);
        if (!id) {
          // Strip trailing suffixes one at a time until we find a match
          let attempt = sku;
          while (!id && attempt.includes('_')) {
            attempt = attempt.replace(/_[^_]+$/, '');
            id = await getItemIdBySku(attempt);
          }
        }
        if (!id) {
          // Only auto-create a NetSuite item if the SKU is currently live
          // (purchasable) on the website. Never fabricate items for
          // discontinued/legacy/internal codes just because they appear on
          // an order — that would pollute NetSuite with non-sellable items.
          if (liveSkus.has(sku.toLowerCase())) {
            id = await createInventoryItem(sku, item.name, item.price);
            if (id) {
              log(`✅ Auto-created NS item for live SKU ${sku} → ID ${id}`);
            } else {
              recordMissingSku(sku, item.name, order.id);
            }
          } else {
            // Don't log per-SKU noise — accumulate and report once at end of run
            recordMissingSku(sku, item.name, order.id);
          }
        }
        itemIdMap[sku] = id || null;
      }

      const { payload: nsOrder, shippingCost } = await mapOrderToNetsuite(order, customerId, itemIdMap);

      const result = await createSalesOrder(nsOrder);
      const nsId = result?.id || result?.internalId || 'unknown';
      saveSyncedOrder(order.id, nsId);
      log(`✅ Order ${order.id} → NetSuite Sales Order ${nsId}`);

      if (nsId !== 'unknown') {
        // Build post-create PATCH: phone + header discount fields
        const patch = {};
        const phone = order.ship_phone || order.bill_phone || '';
        if (phone) patch.custbody231 = phone;
        if (Object.keys(patch).length > 0) {
          try {
            await nsRequest('PATCH', `salesorder/${nsId}`, patch);
            log(`✅ Patched phone/discount on SO ${nsId}`);
          } catch (e) {
            log(`⚠️ Post-create PATCH failed for SO ${nsId}: ${e.message}`, 'error');
          }
        }

        // Force taxcode 12260 on each product line — NS tax engine overrides it on POST
        const taxableItems = (order.items || []).filter(i => i.tax > 0);
        const enshield = (order.charges || []).find(c => c.type === 'enshield_charge');
        const lineCount = taxableItems.length + (enshield && enshield.tax > 0 ? 1 : 0);
        for (let lineNum = 1; lineNum <= lineCount; lineNum++) {
          try {
            await nsRequest('PATCH', `salesorder/${nsId}/item/${lineNum}`, { taxcode: { id: '12260' } });
          } catch (e) {
            // Line may not exist at this number — not critical
          }
        }
        if (lineCount > 0) log(`✅ Forced taxcode 12260 on ${lineCount} line(s) for SO ${nsId}`);
      }
    } catch (err) {
      log(`❌ Order ${order.id} failed: ${err.message}`, 'error');
    }
  }

  // Single consolidated summary instead of per-SKU log spam during the loop above
  const missing = loadMissingSkus();
  const missingCount = Object.keys(missing).length;
  if (missingCount > 0) {
    log(`⚠️ ${missingCount} SKU(s) still unresolved in NetSuite — see logs/missing_skus.json (e.g. ${Object.keys(missing).slice(0, 5).join(', ')}${missingCount > 5 ? ', …' : ''})`, 'error');
  }
}

module.exports = { syncOrdersToNetsuite };
