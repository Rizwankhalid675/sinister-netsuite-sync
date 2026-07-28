const { getOrders } = require('../miva');
const { createSalesOrder, getCustomerByEmail, getItemIdBySku, getItemBySku, createInventoryItem, nsRequest } = require('../netsuite');
const { upsertNSCustomer } = require('./customersToNetsuite');
const { log } = require('../logger');
const fs = require('fs');
const path = require('path');

const SYNCED_FILE = path.join(__dirname, '../logs/synced_orders.json');

function loadSyncedOrders() {
  if (!fs.existsSync(SYNCED_FILE)) return {};
  return JSON.parse(fs.readFileSync(SYNCED_FILE, 'utf8'));
}

function saveSyncedOrder(mivaOrderId, netsuiteId) {
  const synced = loadSyncedOrders();
  synced[mivaOrderId] = { netsuiteId, syncedAt: new Date().toISOString() };
  fs.writeFileSync(SYNCED_FILE, JSON.stringify(synced, null, 2));
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
const SKU_OVERRIDES = {
  'SD-UFC-OIL': '7952',
  'SD-RADTUBE-6.7C-19-HO': '14922',
  'SD-RADTUBE-6.7C-19': '14923',
  'SD-FC-FUEL-U-GRN': '14351',
  'SDG-CAI-6.0': '13309',
  'SD-FC-FUEL-U': '14715',
  'SD-FC-FUEL-U-GRY': '14461',
  'SD-REOFCF-6.0': '14919',
  'SD-COOLFIL-6_0-W': '8210',
  'SD-6_0CF03-01-20': '8210'
};

function mapOrderToNetsuite(order, customerId, itemIdMap = {}) {
  const items = (order.items || [])
    .filter(item => {
      const sku = item.sku || item.code;
      return sku && itemIdMap[sku];
    })
    .map(item => {
      const sku = item.sku || item.code;
      const isBlemish = sku.toLowerCase().includes('-blem') || (item.name || '').toLowerCase().includes('blemish');
      const description = isBlemish
        ? sku
        : (item.options || []).map(o => `${o.attr_prompt}: ${o.opt_prompt}`).join(', ') || item.name;
      const mapped = itemIdMap[sku];
      const nsId = (mapped && typeof mapped === 'object') ? mapped.id : mapped;
      const nsPrice = (mapped && typeof mapped === 'object') ? mapped.price : null;
      // Miva's own line price/quantity is the source of truth for what the
      // customer was actually charged — this includes kit/combo items whose
      // price varies per-order based on selected sub-options even though
      // they share one SKU (NetSuite's item record only stores a single
      // base price and cannot reflect that). Always prefer the Miva price;
      // only fall back to NetSuite's item price when Miva didn't give us a
      // usable one.
      const mivaLinePrice = (item.quantity > 0) ? (item.total ?? item.price * item.quantity) / item.quantity : item.price;
      const hasMivaPrice = typeof mivaLinePrice === 'number' && Number.isFinite(mivaLinePrice) && mivaLinePrice > 0;
      const hasNsPrice = typeof nsPrice === 'number' && Number.isFinite(nsPrice) && nsPrice > 0;
      const rate = hasMivaPrice ? mivaLinePrice : (hasNsPrice ? nsPrice : item.price);
      return {
        item: { id: nsId },
        description,
        quantity: item.quantity,
        price: { id: '-1' },
        rate,
        amount: item.total,
        custcol_hb_miva_order_line_id: item.line_id,
        taxcode: item.tax > 0 ? { id: '12260' } : { id: '-7' },
        location: { id: '2' }
      };
    });

  const shippingCost = order.total_ship || order.shipping_cost || 0;
  const phone = order.ship_phone || order.bill_phone || '';

  // Enshield Package Protection charge → line item (NS item ID 10322)
  const enshield = (order.charges || []).find(c => c.type === 'enshield_charge');
  if (enshield) {
    items.push({
      item: { id: '10322' },
      quantity: 1,
      price: { id: '-1' },
      rate: enshield.amount,
      taxcode: enshield.tax > 0 ? { id: '12260' } : { id: '-7' },
      location: { id: '2' }
    });
  }

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
      const itemIdMap = {};
      for (const item of (order.items || [])) {
        const sku = item.sku || item.code;
        if (!sku || itemIdMap[sku] !== undefined) continue;

        // Check hardcoded overrides first (Celigo parity) — no NetSuite
        // price lookup here, so fall back to the raw Miva line price.
        if (SKU_OVERRIDES[sku]) {
          itemIdMap[sku] = { id: SKU_OVERRIDES[sku], price: null };
          continue;
        }

        // Blemish items map to a generic blemish NS item — its price is not
        // specific to this line, so use the raw Miva line price instead.
        if (sku.toLowerCase().includes('-blem') || (item.name || '').toLowerCase().includes('blemish')) {
          const blemId = await getItemIdBySku('SD-BLEMISH');
          itemIdMap[sku] = blemId ? { id: blemId, price: null } : null;
          continue;
        }

        // Try the exact SKU first — this is a real NetSuite match, so its
        // own price reflects this exact attribute combo (color/finish/etc.)
        let id = null;
        let price = null;
        let matchedAttribute = false;

        const exact = await getItemBySku(sku);
        if (exact) {
          id = exact.id;
          price = exact.price;
        } else {
          // Strip trailing suffixes one at a time until we find a match.
          // Each candidate here is LESS attribute-specific than the last, so
          // once we fall back to a stripped SKU, its NS price does NOT
          // reflect the original line's attribute-driven price delta — we
          // must fall back to the raw Miva line price instead of trusting
          // NetSuite's price for this less-specific item.
          let attempt = sku;
          while (!id && attempt.includes('_')) {
            attempt = attempt.replace(/_[^_]+$/, '');
            const candidate = await getItemBySku(attempt);
            if (candidate) {
              id = candidate.id;
              matchedAttribute = true; // matched on a less-specific SKU
              price = null; // don't trust NS price for a partial match
              break;
            }
          }
        }

        if (!id) {
          // Auto-create the item in NetSuite so the order isn't missing lines
          id = await createInventoryItem(sku, item.name, item.price);
          if (id) log(`✅ Auto-created NS item for SKU ${sku} → ID ${id}`);
          else log(`⚠️ Could not auto-create NS item for SKU ${sku}`, 'error');
        }
        itemIdMap[sku] = id
          ? { id, price: matchedAttribute ? null : price }
          : null;
      }

      const { payload: nsOrder, shippingCost } = mapOrderToNetsuite(order, customerId, itemIdMap);

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
}

module.exports = { syncOrdersToNetsuite };
