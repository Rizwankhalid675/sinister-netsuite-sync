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

// Placeholder / non-part-defining option values that must NOT be appended to the
// NetSuite SKU lookup. These represent "nothing selected" or purely logistical
// choices (e.g. how the order ships), not a physical product variant.
const NON_PART_OPTION_VALUES = new Set(['no-thanks', 'none', 'n/a', 'na']);
const NON_PART_ATTRIBUTE_CODES = new Set([
  'shipping_preference',
  'shippingpreference',
  'ship_preference'
]);

// Normalize a raw Miva option value into the suffix style used by NetSuite
// item ids (e.g. "Dry" -> "DRY", "sd-ck-filter" -> not applicable — codes that
// look like they're already full product codes are handled separately).
function normalizeOptionSuffix(value) {
  return String(value || '')
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toUpperCase();
}

// Given the base Miva SKU and the line item's raw `options` array, build an
// ordered list of candidate NetSuite item SKUs to try, from most-specific
// (base + all meaningful attribute suffixes) to least-specific (base alone).
// This replaces blind trailing-suffix stripping, which breaks whenever the
// distinguishing attribute isn't the last stripped segment (e.g. junk/test
// options embedded earlier in a synthesized sku, or multi-attribute items).
function buildSkuCandidates(baseSku, options) {
  const meaningfulSuffixes = (options || [])
    .filter(o => {
      const attrCode = String(o.attribute || o.attr_code || '').toLowerCase();
      const optCode = String(o.value || o.opt_code || '').toLowerCase();
      if (NON_PART_ATTRIBUTE_CODES.has(attrCode)) return false;
      if (NON_PART_OPTION_VALUES.has(optCode)) return false;
      return true;
    })
    .map(o => normalizeOptionSuffix(o.value || o.opt_code))
    .filter(Boolean);

  const candidates = [];
  // Most specific: base + every meaningful suffix in order encountered.
  if (meaningfulSuffixes.length > 0) {
    candidates.push([baseSku, ...meaningfulSuffixes].join('-'));
    // If there are multiple meaningful attributes, also try each one alone
    // appended to the base, in case NetSuite only varies by a single attribute.
    if (meaningfulSuffixes.length > 1) {
      for (const suffix of meaningfulSuffixes) {
        candidates.push(`${baseSku}-${suffix}`);
      }
    }
  }
  // Least specific: the bare base sku (covers products with no real variants).
  candidates.push(baseSku);
  return [...new Set(candidates)];
}

function mapOrderToNetsuite(order, customerId, itemIdMap = {}) {
  const items = (order.items || [])
    .filter(item => {
      const sku = item.sku || item.code;
      return sku && itemIdMap[sku] && itemIdMap[sku].id;
    })
    .map(item => {
      const sku = item.sku || item.code;
      const entry = itemIdMap[sku];
      const isBlemish = sku.toLowerCase().includes('-blem') || (item.name || '').toLowerCase().includes('blemish');
      const description = isBlemish
        ? sku
        : (item.options || []).map(o => `${o.attr_prompt}: ${o.opt_prompt}`).join(', ') || item.name;
      // Pricing: attribute selections on Miva (e.g. filter media, color/finish,
      // "add cleaning kit") carry their own price deltas that are already baked
      // into item.price/item.total on the Miva order line. If we resolved this
      // line to an attribute-SPECIFIC NetSuite item (entry.matchedAttribute
      // true), that NS item's own on-file price already reflects this exact
      // combo, so prefer it. Otherwise (generic/base item match, or an
      // auto-created item with no price yet) the NS price does NOT reflect
      // this line's attribute selections — using it would silently drop the
      // attribute pricing and leave only descriptive text. In that case,
      // always price from the real Miva line instead.
      const hasNsPrice = entry.price != null && entry.price > 0 && entry.matchedAttribute;
      const rate = hasNsPrice ? entry.price : item.price;
      const amount = hasNsPrice ? Number((rate * (item.quantity || 1)).toFixed(2)) : item.total;
      return {
        item: { id: entry.id },
        description,
        quantity: item.quantity,
        price: { id: '-1' },
        rate,
        amount,
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

        // Check hardcoded overrides first (Celigo parity) — no NS price lookup
        // available for these, so pricing falls back to the raw Miva line price.
        if (SKU_OVERRIDES[sku]) {
          itemIdMap[sku] = { id: SKU_OVERRIDES[sku], price: null, matchedAttribute: false };
          continue;
        }

        // Blemish items map to a generic blemish NS item — this is a generic
        // fallback item, not attribute-specific, so its price must NOT be
        // trusted over the real Miva line price/attribute deltas.
        if (sku.toLowerCase().includes('-blem') || (item.name || '').toLowerCase().includes('blemish')) {
          const blemItem = await getItemBySku('SD-BLEMISH');
          itemIdMap[sku] = blemItem
            ? { id: blemItem.id, price: blemItem.price, matchedAttribute: false }
            : { id: null, price: null, matchedAttribute: false };
          continue;
        }

        // Base sku may already be an exact NetSuite item id (most common case).
        // This is an exact SKU match, so if the item HAS options/attributes,
        // its own price is only trustworthy if it's genuinely attribute-specific
        // (i.e. the base sku itself already encodes the attribute, which is the
        // common case for single-attribute products). Track this as matched.
        let matched = await getItemBySku(sku);
        let matchedAttribute = !!matched;

        if (!matched) {
          // Strip trailing "_something" suffixes one at a time (handles
          // Miva-side blem/annotation suffixes like SD-COOLFIL-6_0-W).
          // This resolves to a BASE/generic item (the suffix was stripped),
          // so its price does not reflect this line's attribute selection.
          let attempt = sku;
          while (!matched && attempt.includes('_')) {
            attempt = attempt.replace(/_[^_]+$/, '');
            matched = await getItemBySku(attempt);
          }
          matchedAttribute = false;
        }

        if (!matched) {
          // Attribute-driven resolution: derive candidate NetSuite SKUs from
          // the base code + the line's real (non-placeholder) option values,
          // e.g. SD-CAI-5.9-94 + cai_filter="Dry" -> SD-CAI-5.9-94-DRY.
          // Tried from most- to least-specific until a real NS item matches.
          // Only candidates that include at least one real attribute suffix
          // (i.e. not the bare base sku) are attribute-specific; the resolved
          // item's own NetSuite price reflects that exact combo, so it's safe
          // to trust for pricing (captures color/finish/filter-media upcharges
          // etc. automatically, without staff manually re-pricing each combo).
          const candidates = buildSkuCandidates(sku, item.options).filter(c => c !== sku);
          for (const candidate of candidates) {
            matched = await getItemBySku(candidate);
            if (matched) {
              // candidates here always excludes the bare base sku (filtered
              // above), so any match found in this loop is genuinely more
              // specific than the base — i.e. it carries a real attribute
              // suffix, so its NetSuite price reflects this exact combo.
              matchedAttribute = true;
              log(`ℹ️ Resolved SKU ${sku} → NetSuite item ${candidate} (ID ${matched.id}) via attribute match`);
              break;
            }
          }
        }

        let id = matched ? matched.id : null;
        let price = matched ? matched.price : null;

        if (!id) {
          // Last resort: auto-create the item in NetSuite so the order isn't
          // missing lines, but use the most attribute-specific candidate name
          // (not the raw, possibly-garbled sku) and flag loudly for review —
          // this should be rare once attribute resolution above is populated.
          const [bestCandidate] = buildSkuCandidates(sku, item.options);
          const createName = bestCandidate || sku;
          id = await createInventoryItem(createName, item.name, item.price);
          price = null; // newly created item — price the line from Miva until reviewed
          matchedAttribute = false;
          if (id) log(`⚠️ No existing NetSuite item matched SKU ${sku} (tried "${createName}") — auto-created new item ID ${id}. Please review in NetSuite.`, 'error');
          else log(`⚠️ Could not auto-create NS item for SKU ${sku}`, 'error');
        }

        itemIdMap[sku] = { id: id || null, price, matchedAttribute };
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

module.exports = { syncOrdersToNetsuite, buildSkuCandidates, normalizeOptionSuffix };
