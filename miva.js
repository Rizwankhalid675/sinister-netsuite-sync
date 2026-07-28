require('dotenv').config();
const axios = require('axios');

const MIVA_URL   = process.env.MIVA_STORE_URL;
const MIVA_TOKEN = process.env.MIVA_API_TOKEN;
const STORE_CODE = process.env.MIVA_STORE_CODE;

async function mivaRequest(body) {
  const response = await axios.post(MIVA_URL, body, {
    headers: {
      'Content-Type': 'application/json',
      'X-Miva-API-Authorization': `MIVA ${MIVA_TOKEN}`
    }
  });
  return response.data;
}

function buildOrderFilters({ startDate, orderId } = {}) {
  const filters = [
    { name: 'ondemandcolumns', value: ['payment_module', 'cust_pw_email', 'cust_login', 'ship_method', 'customer', 'items', 'charges', 'payments', 'payment_data', 'notes'] }
  ];
  if (orderId !== undefined) {
    const exactId = String(orderId).trim();
    if (!/^\d+$/.test(exactId)) throw new Error('Miva order ID must be numeric');
    filters.push({ name: 'search', value: [{ field: 'id', operator: 'EQ', value: exactId }] });
  } else if (startDate) {
    const ts = Math.floor(new Date(startDate).getTime() / 1000);
    filters.push({ name: 'search', value: [{ field: 'orderdate', operator: 'GT', value: String(ts) }] });
  }
  return filters;
}

async function getOrders({ startDate, orderId, batchSize = 50 } = {}) {
  const filters = buildOrderFilters({ startDate, orderId });

  const allOrders = [];
  let offset = 0;
  while (true) {
    const body = {
      Store_Code: STORE_CODE,
      Function: 'OrderList_Load_Query',
      Count: batchSize,
      Offset: offset,
      Miva_Request_Timestamp: Math.floor(Date.now() / 1000),
      Filter: filters
    };
    const result = await mivaRequest(body);
    const page = result.data?.data || result.data || [];
    allOrders.push(...page);
    if (page.length < batchSize) break;
    offset += batchSize;
  }
  return allOrders;
}

async function updateOrderShipment(orderId, trackingNumber, shippedDate) {
  const body = {
    Store_Code: STORE_CODE,
    Function: 'OrderShipmentList_Load_Query',
    Order_Id: orderId
  };
  const result = await mivaRequest(body);
  return result;
}

async function updateProductId(productCode, netsuiteId) {
  const body = {
    Store_Code: STORE_CODE,
    Function: 'Product_Update',
    Product_Code: productCode,
    CustomField_Values: {
      CustomFields: [{ code: 'netsuite_id', value: netsuiteId }]
    }
  };
  return await mivaRequest(body);
}

async function getActiveProductCodes({ batchSize = 200 } = {}) {
  const codes = new Set();
  let offset = 0;
  while (true) {
    const body = {
      Store_Code: STORE_CODE,
      Function: 'ProductList_Load_Query',
      Count: batchSize,
      Offset: offset,
      Miva_Request_Timestamp: Math.floor(Date.now() / 1000),
      Filter: [{ name: 'search', value: [{ field: 'product_active', operator: 'EQ', value: '1' }] }]
    };
    const result = await mivaRequest(body);
    const page = result.data?.data || result.data || [];
    for (const p of page) codes.add(p.code || p.product_code);
    if (page.length < batchSize) break;
    offset += batchSize;
  }
  return codes;
}

module.exports = { getOrders, buildOrderFilters, updateOrderShipment, updateProductId, getActiveProductCodes };
