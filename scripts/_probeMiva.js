#!/usr/bin/env node
/* TEMP read-only probe: does the Miva email filter actually filter? */
require('dotenv').config();
const axios = require('axios');

const MIVA_URL   = process.env.MIVA_STORE_URL;
const MIVA_TOKEN = process.env.MIVA_API_TOKEN;
const STORE_CODE = process.env.MIVA_STORE_CODE;

async function q(email) {
  const res = await axios.post(MIVA_URL, {
    Store_Code: STORE_CODE,
    Function: 'CustomerList_Load_Query',
    Count: 5,
    Miva_Request_Timestamp: Math.floor(Date.now() / 1000),
    Filter: [
      { name: 'search', value: [{ field: 'email', operator: 'EQ', value: email }] }
    ]
  }, {
    headers: { 'Content-Type': 'application/json', 'X-Miva-API-Authorization': `MIVA ${MIVA_TOKEN}` }
  });
  const total = res.data?.data?.total_count ?? res.data?.total_count ?? '?';
  const list = res.data?.data?.data || res.data?.data || [];
  console.log(`\nemail=${email}  success=${res.data?.success}  total_count=${total}  returned=${list.length}`);
  list.slice(0, 5).forEach(c => {
    console.log(`   id=${c.id} login=${c.login} email=${c.email} name="${c.bill_fname||c.ship_fname||''} ${c.bill_lname||c.ship_lname||''}"`);
  });
  if (list[0]) {
    console.log('   --- ALL FIELDS of list[0] ---');
    console.log('   keys:', Object.keys(list[0]).join(', '));
    const nameFields = ['login','email','pw_email','ship_fname','ship_lname','bill_fname','bill_lname','ship_comp','bill_comp'];
    for (const f of nameFields) {
      console.log(`   ${f} = ${JSON.stringify(list[0][f])}`);
    }
  }
  if (res.data?.success === 0 || res.data?.error_message) {
    console.log('   RAW:', JSON.stringify(res.data).slice(0, 400));
  }
}

(async () => {
  await q('ivantenorio334@gmail.com');
  await q('pbrce@hotmail.com');
  await q('this-address-does-not-exist-zzz@example.com');
})();
