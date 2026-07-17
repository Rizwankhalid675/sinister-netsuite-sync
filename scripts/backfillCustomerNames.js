#!/usr/bin/env node
/**
 * One-time backfill: fix NetSuite customers that were created with the
 * placeholder name "FNU LNU" by the old customer sync.
 *
 * For each target customer it:
 *   1. Reads the customer from NetSuite (to get their email).
 *   2. Looks up the real name in Miva by that email.
 *   3. PATCHes NetSuite with the derived name (real name -> company ->
 *      email local-part). Never re-writes "FNU LNU".
 *
 * Safe by default: prints what it WOULD do and makes no changes unless you
 * pass --apply. Reuses the same env vars as flows/customersToNetsuite.js.
 *
 *   node scripts/backfillCustomerNames.js            # dry run (default)
 *   node scripts/backfillCustomerNames.js --apply    # actually PATCH NetSuite
 *
 * Optionally override the ID list:
 *   node scripts/backfillCustomerNames.js --ids 69454543,69454575 --apply
 */
require('dotenv').config();
const axios = require('axios');
const crypto = require('crypto');
const OAuth = require('oauth-1.0a');

const MIVA_URL   = process.env.MIVA_STORE_URL;
const MIVA_TOKEN = process.env.MIVA_API_TOKEN;
const STORE_CODE = process.env.MIVA_STORE_CODE;
const NETSUITE_ACCOUNT_ID = process.env.NETSUITE_ACCOUNT_ID;
const BASE = `https://${NETSUITE_ACCOUNT_ID}.suitetalk.api.netsuite.com/services/rest`;

// ---- CLI args ----------------------------------------------------------
const APPLY = process.argv.includes('--apply');
const idsFlag = process.argv[process.argv.indexOf('--ids') + 1];
const DEFAULT_IDS = [
  '69454543', '69454575', '69454609', '69454621',
  '69454622', '69454690', '69455028', '69455535'
];
const TARGET_IDS =
  process.argv.includes('--ids') && idsFlag
    ? idsFlag.split(',').map(s => s.trim()).filter(Boolean)
    : DEFAULT_IDS;

// ---- NetSuite OAuth ----------------------------------------------------
const oauth = new OAuth({
  consumer: {
    key: process.env.NETSUITE_CONSUMER_KEY,
    secret: process.env.NETSUITE_CONSUMER_SECRET
  },
  signature_method: 'HMAC-SHA256',
  hash_function(b, k) { return crypto.createHmac('sha256', k).update(b).digest('base64'); }
});
const token = {
  key: process.env.NETSUITE_TOKEN_ID,
  secret: process.env.NETSUITE_TOKEN_SECRET
};

function nsHeaders(url, method) {
  const h = oauth.toHeader(oauth.authorize({ url, method }, token));
  const auth = h.Authorization.replace('OAuth ', `OAuth realm="${NETSUITE_ACCOUNT_ID}",`);
  return { Authorization: auth, 'Content-Type': 'application/json' };
}

// The IDs in Amanda's list are entityId (the visible "ID"/account number),
// NOT the internal record id the REST API addresses records by. Resolve the
// internal id first by querying the customer collection on entityId.
async function resolveInternalId(entityId) {
  const q = encodeURIComponent(`entityId IS ${entityId}`);
  const url = `${BASE}/record/v1/customer?q=${q}`;
  const res = await axios.get(url, { headers: nsHeaders(url, 'GET') });
  const items = res.data?.items || [];
  if (items.length === 0) return null;
  if (items.length > 1) {
    throw new Error(`entityId ${entityId} matched ${items.length} customers — ambiguous, skipping`);
  }
  return items[0].id;
}

async function getNSCustomer(id) {
  const url = `${BASE}/record/v1/customer/${id}`;
  const res = await axios.get(url, { headers: nsHeaders(url, 'GET') });
  return res.data;
}

async function patchNSCustomer(id, payload) {
  const url = `${BASE}/record/v1/customer/${id}`;
  await axios.patch(url, payload, { headers: nsHeaders(url, 'PATCH') });
}

// ---- Miva lookup by email ---------------------------------------------
async function getMivaCustomerByEmail(email) {
  const res = await axios.post(MIVA_URL, {
    Store_Code: STORE_CODE,
    Function: 'CustomerList_Load_Query',
    Count: 1,
    Miva_Request_Timestamp: Math.floor(Date.now() / 1000),
    Filter: [
      { name: 'search', value: [{ field: 'email', operator: 'EQ', value: email }] }
    ]
  }, {
    headers: { 'Content-Type': 'application/json', 'X-Miva-API-Authorization': `MIVA ${MIVA_TOKEN}` }
  });
  const list = res.data?.data?.data || res.data?.data || [];
  return list[0] || null;
}

// ---- Name derivation (mirrors the fixed sync logic) --------------------
function derivePayload(mivaCustomer, email) {
  const firstName = mivaCustomer?.ship_fname || mivaCustomer?.bill_fname || '';
  const lastName  = mivaCustomer?.ship_lname || mivaCustomer?.bill_lname || '';
  const company   = mivaCustomer?.ship_comp || mivaCustomer?.bill_comp || '';
  const emailLocal = (email || '').split('@')[0] || '';

  if (firstName || lastName) {
    return { isperson: true, firstname: firstName, lastname: lastName, _src: 'name' };
  }
  if (company) {
    return { isperson: false, companyname: company, _src: 'company' };
  }
  if (emailLocal) {
    return { isperson: true, firstname: emailLocal, lastname: '', _src: 'email-local' };
  }
  return null;
}

function looksLikePlaceholder(cust) {
  const f = (cust.firstName || '').toUpperCase();
  const l = (cust.lastName || '').toUpperCase();
  return f === 'FNU' || l === 'LNU';
}

// ---- Main --------------------------------------------------------------
(async () => {
  console.log(`\nBackfill customer names — ${APPLY ? 'APPLY (will PATCH)' : 'DRY RUN (no changes)'}`);
  console.log(`Targets: ${TARGET_IDS.length} customer id(s)\n`);

  let fixed = 0, skipped = 0, failed = 0;

  for (const entityId of TARGET_IDS) {
    try {
      const id = await resolveInternalId(entityId);
      if (!id) {
        console.log(`- ${entityId}: no NetSuite customer with that entityId — skipping`);
        skipped++;
        continue;
      }
      const cust = await getNSCustomer(id);
      const email = cust.email || '';
      const current = `${cust.firstName || ''} ${cust.lastName || ''}`.trim() || '(blank)';

      const tag = `${entityId} (internal ${id})`;

      if (!looksLikePlaceholder(cust)) {
        console.log(`- ${tag}: name is "${current}" — not a FNU/LNU placeholder, skipping`);
        skipped++;
        continue;
      }
      if (!email) {
        console.log(`- ${tag}: no email on NetSuite record — cannot look up in Miva, skipping`);
        skipped++;
        continue;
      }

      const miva = await getMivaCustomerByEmail(email);
      const payload = derivePayload(miva, email);

      if (!payload) {
        console.log(`- ${tag} <${email}>: no name/company/email-local derivable — leaving as-is`);
        skipped++;
        continue;
      }

      const { _src, ...body } = payload;
      const preview = body.companyname
        ? `company="${body.companyname}"`
        : `name="${(body.firstname || '') + ' ' + (body.lastname || '')}".trim()`;

      if (APPLY) {
        await patchNSCustomer(id, body);
        console.log(`✅ ${tag} <${email}>: "${current}" -> ${preview} (from ${_src})`);
      } else {
        console.log(`   ${tag} <${email}>: would set ${preview} (from ${_src})`);
      }
      fixed++;
    } catch (err) {
      const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
      console.log(`❌ ${entityId}: ${detail}`);
      failed++;
    }
  }

  console.log(`\nDone. ${APPLY ? 'patched' : 'would-fix'}=${fixed}  skipped=${skipped}  failed=${failed}`);
  if (!APPLY && fixed > 0) console.log('Re-run with --apply to write these changes to NetSuite.');
})();
