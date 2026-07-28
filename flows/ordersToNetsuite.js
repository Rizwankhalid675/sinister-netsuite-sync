const { getOrders } = require('../miva');
const {
  createSalesOrder,
  getCustomerByEmail,
  getItemsBySku,
  getItemsByInternalId,
  getItemMetadata,
  getSalesOrderFinancialSummary,
  getTransactionsByMivaOrderId,
} = require('../netsuite');
const { upsertNSCustomer } = require('./customersToNetsuite');
const { log } = require('../logger');
const {
  expandMivaItems,
  validateMivaOrderTotals,
  resolveExpandedLines,
  buildNetsuiteLines,
  assertProtectionItemTaxable,
  assertTotalsMatch,
  moneyToCents,
} = require('../lib/orderMapping');
const fs = require('fs');
const path = require('path');

const SYNCED_FILE = path.join(__dirname, '../logs/synced_orders.json');

function loadSyncedOrders() {
  if (!fs.existsSync(SYNCED_FILE)) return {};
  return JSON.parse(fs.readFileSync(SYNCED_FILE, 'utf8'));
}

function saveSyncState(mivaOrderId, state) {
  const synced = loadSyncedOrders();
  synced[mivaOrderId] = { ...state, syncedAt: new Date().toISOString() };
  fs.writeFileSync(SYNCED_FILE, JSON.stringify(synced, null, 2));
}

const SHIP_METHOD_MAP = {
  'Free Shipping': 10325,
  'UPS&reg; Ground': 8297,
  'UPS 2nd Day Air&reg;': 8298,
  'UPS Next Day Air&reg;': 8299,
  'UPS 3 Day Select&reg;': 8300,
  'U.S.P.S. Priority Mail&reg;': 9316,
  'Will Call &#40;Pick up at Sinister Roseville, CA&#41;': 12147,
};

// Explicitly disambiguates duplicate NetSuite item names and preserves proven
// legacy mappings. Price-bearing option SKUs still must resolve to real items.
const SKU_OVERRIDES = {
  'SD-ARP-HEAD-6.0': '13609',
  'SD-UFC-OIL': '7952',
  'SD-RADTUBE-6.7C-19-HO': '14922',
  'SD-RADTUBE-6.7C-19': '14923',
  'SD-FC-FUEL-U-GRN': '14351',
  'SDG-CAI-6.0': '13309',
  'SD-FC-FUEL-U': '14715',
  'SD-FC-FUEL-U-GRY': '14461',
  'SD-REOFCF-6.0': '14919',
  'SD-COOLFIL-6_0-W': '8210',
  'SD-6_0CF03-01-20': '8210',
};

const NON_PART_OPTION_VALUES = new Set(['no-thanks', 'none', 'n/a', 'na']);
const NON_PART_ATTRIBUTE_CODES = new Set(['shipping_preference', 'shippingpreference', 'ship_preference']);

function normalizeOptionSuffix(value) {
  return String(value || '').trim().replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase();
}

function buildSkuCandidates(baseSku, options) {
  const suffixes = (options || [])
    .filter((option) => {
      const attribute = String(option.attribute || option.attr_code || '').toLowerCase();
      const value = String(option.value || option.opt_code || '').toLowerCase();
      return !NON_PART_ATTRIBUTE_CODES.has(attribute) && !NON_PART_OPTION_VALUES.has(value);
    })
    .map((option) => normalizeOptionSuffix(option.value || option.opt_code))
    .filter(Boolean);
  return [...new Set([
    ...(suffixes.length ? [[baseSku, ...suffixes].join('-')] : []),
    ...(suffixes.length > 1 ? suffixes.map((suffix) => `${baseSku}-${suffix}`) : []),
    baseSku,
  ])];
}

function mapOrderToNetsuite(order, customerId, resolvedLines) {
  const phone = order.ship_phone || order.bill_phone || '';
  const shippingCost = Number(order.total_ship || order.shipping_cost || 0);
  const discount = (order.charges || []).find(
    (charge) => charge.type === 'DISCOUNT' || (charge.amount < 0 && charge.type !== 'enshield_charge')
  );
  const payload = {
    shippingAddress: {
      override: false,
      addressee: `${order.ship_fname || ''} ${order.ship_lname || ''}`.trim(),
      attention: order.ship_comp || '',
      addr1: order.ship_addr1,
      addr2: order.ship_addr2 || '',
      city: order.ship_city,
      state: order.ship_state,
      zip: order.ship_zip,
      country: { id: order.ship_cntry || 'US' },
      addrPhone: phone,
    },
    billingAddress: {
      override: false,
      addressee: `${order.bill_fname || ''} ${order.bill_lname || ''}`.trim(),
      attention: order.bill_comp || '',
      addr1: order.bill_addr1,
      addr2: order.bill_addr2 || '',
      city: order.bill_city,
      state: order.bill_state,
      zip: order.bill_zip,
      country: { id: order.bill_cntry || 'US' },
      addrPhone: order.bill_phone || phone,
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
    item: { items: buildNetsuiteLines(resolvedLines, order) },
  };
  if (discount) {
    payload.discountitem = { id: '38' };
    payload.discountrate = Number(discount.amount);
  }
  if (customerId) payload.entity = { id: customerId };
  return { payload, shippingCost };
}

async function ensureCustomer(order) {
  const email = order.ship_email || order.cust_pw_email || '';
  let customerId = email ? await getCustomerByEmail(email) : null;
  if (customerId) return customerId;
  customerId = await upsertNSCustomer({
    email,
    pw_email: email,
    ship_fname: order.ship_fname || order.bill_fname,
    ship_lname: order.ship_lname || order.bill_lname,
    bill_fname: order.bill_fname,
    bill_lname: order.bill_lname,
    ship_phone: order.ship_phone || order.bill_phone,
    bill_phone: order.bill_phone,
    ship_comp: order.ship_comp || order.bill_comp,
    bill_comp: order.bill_comp,
  });
  if (!customerId) throw new Error(`Could not find or create customer for ${email}`);
  return customerId;
}

async function prepareOrder(order, dependencies = {}) {
  const itemLookup = dependencies.getItemsBySku || getItemsBySku;
  const itemIdLookup = dependencies.getItemsByInternalId || getItemsByInternalId;
  const metadataLookup = dependencies.getItemMetadata || getItemMetadata;
  const expanded = expandMivaItems(order);
  const reconciliation = validateMivaOrderTotals(order, expanded);
  const protection = (order.charges || []).find((charge) => charge.type === 'enshield_charge');
  if (protection && Number(protection.tax || 0) > 0) {
    assertProtectionItemTaxable(order, await metadataLookup('10322'));
  }
  const resolved = await resolveExpandedLines(expanded, itemLookup, SKU_OVERRIDES, itemIdLookup);
  return { expanded, resolved, reconciliation };
}

async function syncSingleOrder(order, dependencies = {}) {
  const syncedOrders = dependencies.syncedOrders || {};
  const tracked = syncedOrders[order.id];
  if (tracked) {
    return {
      status: 'skipped',
      netsuiteId: tracked.netsuiteId || null,
      reconciled: tracked.reconciled === true,
    };
  }

  const prepared = await prepareOrder(order, dependencies);
  const findExisting = dependencies.getTransactionsByMivaOrderId || getTransactionsByMivaOrderId;
  const existingOrders = await findExisting(order.id);
  if (existingOrders.length > 1) {
    throw new Error(`Multiple NetSuite sales orders match Miva order ${order.id}`);
  }

  const persist = dependencies.saveSyncState || saveSyncState;
  const getSummary = dependencies.getSalesOrderFinancialSummary || getSalesOrderFinancialSummary;
  let netsuiteId;
  let status;

  if (existingOrders.length === 1) {
    netsuiteId = String(existingOrders[0].id);
    status = 'adopted';
  } else {
    const resolveCustomer = dependencies.ensureCustomer || ensureCustomer;
    const customerId = await resolveCustomer(order);
    const { payload } = mapOrderToNetsuite(order, customerId, prepared.resolved);
    const createOrder = dependencies.createSalesOrder || createSalesOrder;
    const result = await createOrder(payload);
    netsuiteId = String(result?.id || result?.internalId || '');
    if (!netsuiteId) throw new Error('NetSuite did not return a sales order ID');
    status = 'created';
  }

  const state = {
    netsuiteId,
    reconciled: false,
    reconciliation: {
      mivaTotalCents: moneyToCents(order.total),
      netsuiteTotalCents: null,
      productCents: prepared.reconciliation.productCents,
    },
  };
  persist(order.id, state);

  const summary = await getSummary(netsuiteId);
  state.reconciliation.netsuiteTotalCents = moneyToCents(summary.total);
  try {
    assertTotalsMatch(order.total, summary.total);
    state.reconciled = true;
  } finally {
    persist(order.id, state);
  }

  return { status, netsuiteId, reconciled: state.reconciled };
}

async function syncOrdersToNetsuite() {
  const synced = loadSyncedOrders();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const orders = await getOrders({ startDate: since });
  log(`Found ${orders.length} orders to check`);

  for (const order of orders) {
    try {
      const result = await syncSingleOrder(order, { syncedOrders: synced });
      if (result.status === 'skipped') {
        log(`Order ${order.id} already synced - skipping`);
      } else {
        log(`Order ${order.id} -> NetSuite Sales Order ${result.netsuiteId}; total reconciled`);
      }
    } catch (error) {
      log(`Order ${order.id} blocked: ${error.message}`, 'error');
    }
  }
}

module.exports = {
  syncOrdersToNetsuite,
  syncSingleOrder,
  prepareOrder,
  mapOrderToNetsuite,
  buildSkuCandidates,
  normalizeOptionSuffix,
};
