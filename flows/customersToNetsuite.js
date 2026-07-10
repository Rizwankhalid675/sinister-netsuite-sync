require('dotenv').config();
const axios = require('axios');
const { log } = require('../logger');
const fs = require('fs');
const path = require('path');

const MIVA_URL   = process.env.MIVA_STORE_URL;
const MIVA_TOKEN = process.env.MIVA_API_TOKEN;
const STORE_CODE = process.env.MIVA_STORE_CODE;
const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID;

const SYNCED_FILE = path.join(__dirname, '../logs/synced_customers.json');

function loadSynced() {
  if (!fs.existsSync(SYNCED_FILE)) return {};
  return JSON.parse(fs.readFileSync(SYNCED_FILE, 'utf8'));
}

function saveSynced(email, nsId) {
  const data = loadSynced();
  data[email] = { nsId, syncedAt: new Date().toISOString() };
  fs.writeFileSync(SYNCED_FILE, JSON.stringify(data, null, 2));
}

async function getMivaCustomers(since) {
  const ts = Math.floor(new Date(since).getTime() / 1000);
  const response = await axios.post(MIVA_URL, {
    Store_Code: STORE_CODE,
    Function: 'CustomerList_Load_Query',
    Count: 100,
    Miva_Request_Timestamp: Math.floor(Date.now() / 1000),
    Filter: [
      { name: 'search', value: [{ field: 'dt_updated', operator: 'GT', value: String(ts) }] }
    ]
  }, {
    headers: { 'Content-Type': 'application/json', 'X-Miva-API-Authorization': `MIVA ${MIVA_TOKEN}` }
  });
  return response.data?.data?.data || response.data?.data || [];
}

async function upsertNSCustomer(customer) {
  const crypto = require('crypto');
  const OAuth = require('oauth-1.0a');
  const oauth = new OAuth({
    consumer: { key: process.env.NETSUITE_CONSUMER_KEY, secret: process.env.NETSUITE_CONSUMER_SECRET },
    signature_method: 'HMAC-SHA256',
    hash_function(b, k) { return crypto.createHmac('sha256', k).update(b).digest('base64'); }
  });
  const token = { key: process.env.NETSUITE_TOKEN_ID, secret: process.env.NETSUITE_TOKEN_SECRET };
  const BASE = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest`;

  // Check if customer exists by email
  const searchUrl = `${BASE}/query/v1/suiteql`;
  const email = (customer.email || customer.pw_email || '').replace(/'/g, "''");
  if (!email) return null;

  const h1 = oauth.toHeader(oauth.authorize({ url: searchUrl, method: 'POST' }, token));
  const auth1 = h1.Authorization.replace('OAuth ', `OAuth realm="${NETSUITE_ACCOUNT_ID}",`);
  const searchRes = await axios.post(searchUrl, {
    q: `SELECT id FROM customer WHERE email = '${email}'`
  }, { headers: { Authorization: auth1, 'Content-Type': 'application/json', 'Prefer': 'transient' } });

  const existing = searchRes.data?.items?.[0];

  const payload = {
    isperson: true,
    firstname: customer.ship_fname || customer.bill_fname || 'FNU',
    lastname: customer.ship_lname || customer.bill_lname || 'LNU',
    email: customer.email || customer.pw_email,
    phone: customer.bill_phone || customer.ship_phone || '',
    billphone: customer.bill_phone || customer.ship_phone || '',
    mobilephone: customer.ship_phone || customer.bill_phone || '',
    companyname: customer.ship_comp || customer.bill_comp || '',
    subsidiary: { id: '1' },
    currency: { id: '1' },
    customform: { id: '355' },
    category: { id: '2' }
  };

  const recordUrl = existing
    ? `${BASE}/record/v1/customer/${existing.id}`
    : `${BASE}/record/v1/customer`;
  const method = existing ? 'PATCH' : 'POST';

  const h2 = oauth.toHeader(oauth.authorize({ url: recordUrl, method }, token));
  const auth2 = h2.Authorization.replace('OAuth ', `OAuth realm="${NETSUITE_ACCOUNT_ID}",`);
  const res = await axios({ method, url: recordUrl, data: payload, headers: { Authorization: auth2, 'Content-Type': 'application/json' } });

  if (existing) return existing.id;
  const match = res.headers?.location?.match(/\/(\d+)$/);
  return match ? match[1] : null;
}

async function syncCustomersToNetsuite() {
  const synced = loadSynced();
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const customers = await getMivaCustomers(since);

  log(`Found ${customers.length} Miva customers updated in last 24h`);

  for (const customer of customers) {
    const email = customer.email || customer.pw_email || '';
    if (!email) continue;
    if (synced[email] && new Date(synced[email].syncedAt) > new Date(Date.now() - 60 * 60 * 1000)) continue;

    try {
      const nsId = await upsertNSCustomer(customer);
      if (nsId) {
        saveSynced(email, nsId);
        log(`✅ Customer ${email} → NetSuite ${nsId}`);
      }
    } catch (err) {
      log(`❌ Customer ${email} failed: ${err.message}`, 'error');
    }
  }
}

module.exports = { syncCustomersToNetsuite, upsertNSCustomer };
