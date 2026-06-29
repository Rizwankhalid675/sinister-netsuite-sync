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

async function getOrders({ startDate, batchSize = 50 } = {}) {
  const filters = [
    { name: 'ondemandcolumns', value: ['payment_module', 'cust_pw_email', 'cust_login', 'ship_method', 'customer', 'items', 'charges', 'payments', 'payment_data', 'notes'] }
  ];
  if (startDate) {
    const ts = Math.floor(new Date(startDate).getTime() / 1000);
    filters.push({ name: 'search', value: [{ field: 'orderdate', operator: 'GT', value: String(ts) }] });
  }

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

module.exports = { getOrders, updateOrderShipment, updateProductId };
