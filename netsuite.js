require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const OAuth = require('oauth-1.0a');

const ACCOUNT_ID       = process.env.NETSUITE_ACCOUNT_ID;
const CONSUMER_KEY     = process.env.NETSUITE_CONSUMER_KEY;
const CONSUMER_SECRET  = process.env.NETSUITE_CONSUMER_SECRET;
const TOKEN_ID         = process.env.NETSUITE_TOKEN_ID;
const TOKEN_SECRET     = process.env.NETSUITE_TOKEN_SECRET;

const ACCOUNT_ID_DASH  = ACCOUNT_ID.replace(/_/g, '-');
const BASE_URL = `https://${ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest`;

const oauth = new OAuth({
  consumer: { key: CONSUMER_KEY, secret: CONSUMER_SECRET },
  signature_method: 'HMAC-SHA256',
  hash_function(base_string, key) {
    return crypto.createHmac('sha256', key).update(base_string).digest('base64');
  }
});

const token = { key: TOKEN_ID, secret: TOKEN_SECRET };

function getTBAHeader(method, url) {
  const authData = oauth.authorize({ url, method }, token);
  const header = oauth.toHeader(authData);
  // NetSuite requires realm as the account ID (no dashes)
  return header.Authorization.replace('OAuth ', `OAuth realm="${ACCOUNT_ID}",`);
}

async function nsRequest(method, path, data = null) {
  const url = `${BASE_URL}/record/v1/${path}`;
  const config = {
    method,
    url,
    headers: {
      'Authorization': getTBAHeader(method, url),
      'Content-Type': 'application/json'
    }
  };
  if (data) config.data = data;
  try {
    const response = await axios(config);
    // NetSuite returns 204 with Location header for POST — extract ID from URL
    if (response.status === 204 && response.headers?.location) {
      const match = response.headers.location.match(/\/(\d+)$/);
      return { id: match ? match[1] : null };
    }
    return response.data;
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`${err.response?.status} ${detail}`);
  }
}

async function suiteQL(query) {
  const url = `${BASE_URL}/query/v1/suiteql`;
  try {
    const response = await axios.post(url, { q: query }, {
      headers: {
        'Authorization': getTBAHeader('POST', url),
        'Content-Type': 'application/json',
        'Prefer': 'transient'
      }
    });
    return response.data.items || [];
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    throw new Error(`SuiteQL failed: ${detail}`);
  }
}

async function createSalesOrder(orderData) {
  return await nsRequest('POST', 'salesorder', orderData);
}

async function createCustomerDeposit(depositData) {
  return await nsRequest('POST', 'customerdeposit', depositData);
}

async function createInvoice(invoiceData) {
  return await nsRequest('POST', 'invoice', invoiceData);
}

async function getFulfilledOrders(since) {
  const sinceDate = since.split('T')[0];

  // Get fulfillments + Miva order ID from parent SO in one query
  const rows = await suiteQL(
    `SELECT f.id, so.custbody_hb_miva_order_id FROM itemfulfillment f ` +
    `INNER JOIN transaction so ON so.id = f.createdfrom ` +
    `WHERE f.lastmodifieddate >= TO_DATE('${sinceDate}', 'YYYY-MM-DD') AND f.status = 'C' ` +
    `AND so.custbody_hb_miva_order_id IS NOT NULL`
  );

  if (!rows.length) return [];

  // Build tracking map from shipmentpackage separately
  const ifIds = rows.map(r => r.id);
  const trackingMap = {};
  for (let i = 0; i < ifIds.length; i += 50) {
    const chunk = ifIds.slice(i, i + 50);
    const pkgs = await suiteQL(`SELECT itemfulfillment, trackingnumber, carrierpackaging FROM shipmentpackage WHERE itemfulfillment IN (${chunk.join(',')})`);
    for (const p of pkgs) {
      if (!trackingMap[p.itemfulfillment]) trackingMap[p.itemfulfillment] = { TrackingNum: p.trackingnumber || '', ShipCarrier: p.carrierpackaging || '' };
    }
  }

  return rows.map(r => ({
    id: r.id,
    Order_Id: r.custbody_hb_miva_order_id,
    TrackingNum: trackingMap[r.id]?.TrackingNum || '',
    ShipCarrier: trackingMap[r.id]?.ShipCarrier || ''
  }));
}

async function getCustomerByEmail(email) {
  const rows = await suiteQL(`SELECT id FROM customer WHERE email = '${email.replace(/'/g, "''")}'`);
  return rows.length ? rows[0].id : null;
}

async function getItemIdBySku(sku) {
  const escaped = sku.replace(/'/g, "''");
  const rows = await suiteQL(`SELECT id FROM item WHERE itemid = '${escaped}' AND isinactive = 'F'`);
  return rows.length ? rows[0].id : null;
}

async function createInventoryItem(sku, name, price) {
  const result = await nsRequest('POST', 'inventoryitem', {
    itemid: sku,
    displayname: name || sku,
    salesdescription: name || sku,
    baseprice: price || 0,
    subsidiaryList: { items: [{ id: '1' }] },
    location: { id: '2' },
    taxschedule: { id: '1' },
    costcategory: { id: '4' }
  });
  return result?.id || null;
}

async function getInventoryItems() {
  return await suiteQL(`SELECT id, itemid FROM item WHERE isinactive = 'F' ORDER BY id`);
}

async function updateInventoryItem(nsItemId, mivaProductId, mivaProductCode) {
  return await nsRequest('PATCH', `inventoryitem/${nsItemId}`, {
    custitem_hb_miva_product_id: String(mivaProductId),
    custitem_hb_miva_product_code: mivaProductCode,
    ignoreMandatoryFields: true
  });
}

module.exports = { nsRequest, suiteQL, createSalesOrder, createCustomerDeposit, createInvoice, getFulfilledOrders, getCustomerByEmail, getItemIdBySku, createInventoryItem, getInventoryItems, updateInventoryItem };
