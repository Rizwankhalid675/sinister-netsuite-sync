// One-off: push the integrations tech-stack inventory to the "Tech Stack" board.
// Usage: node monday-scripts/push-tech-stack.js
// Reuses the shared monday.js helpers (token from Work-root .env via env.js).
const { mondayRequest, ensureColumns, ensureGroup, findItemByName, createItem, updateItem, sleep } = require('../monday');

const BOARD_ID = '18423187689';
const GROUP_TITLE = 'Integrations — Tech Stack';

const ROWS = [
  {
    name: 'sinister-netsuite-sync',
    stack: 'axios, crypto-js, dotenv, node-cron, oauth-1.0a, pdfkit, xlsx',
    body:
      'What: Keeps orders and inventory in sync between the sales channel and NetSuite (ERP).\n' +
      'How: Runs on a node-cron schedule. Calls NetSuite REST API with OAuth 1.0a signed requests ' +
      '(oauth-1.0a + crypto-js build the HMAC-SHA256 signature). axios sends the HTTP calls, dotenv loads ' +
      'secrets from .env. Generates PDF order/packing docs with pdfkit and Excel reports with xlsx.',
  },
  {
    name: 'sinister-netsuite-sync-linux',
    stack: 'axios, crypto-js, dotenv, node-cron, oauth-1.0a, pdfkit, xlsx, uuid + PM2 (nginx, dashboard server)',
    body:
      'What: Same sync, hardened for a Linux server with a live dashboard.\n' +
      'How: Same core stack plus uuid (unique job IDs) and PM2 — a process manager that keeps the sync alive, ' +
      'restarts on crash, and runs an nginx-fronted dashboard server to watch sync status in a browser.',
  },
  {
    name: 'tiktok-netsuite-sync / netsuite-sync',
    stack: 'axios, crypto-js, dotenv, node-cron, oauth-1.0a',
    body:
      'What: The NetSuite side of the TikTok Shop -> NetSuite pipeline.\n' +
      'How: Scheduled node-cron job; authenticates to NetSuite with OAuth 1.0a (crypto-js for signing), ' +
      'pushes/pulls orders via axios.',
  },
  {
    name: 'tiktok-netsuite-sync / tiktok-sync',
    stack: 'axios, crypto, dotenv, express, node-cron, oauth-1.0a, open',
    body:
      'What: The TikTok Shop side — pulls TikTok orders and refreshes tokens.\n' +
      'How: Uses axios + crypto to sign TikTok Shop API requests, express runs a small callback/webhook server, ' +
      'and open launches the browser for the OAuth token-authorization step. dotenv holds the TikTok app keys.',
  },
  {
    name: 'netsuite-monday-integration',
    stack: 'axios, dotenv, node-cron, oauth-1.0a, pdfkit, xlsx',
    body:
      'What: Mirrors NetSuite order/inventory data into Monday.com boards.\n' +
      'How: node-cron schedule; reads NetSuite via axios + OAuth 1.0a, then writes items/columns to Monday via ' +
      'its GraphQL API. Produces pdfkit/xlsx documents for attachments.',
  },
  {
    name: 'sinister-forms-api',
    stack: 'express (Node >=20, private)',
    body:
      'What: Lightweight web API that receives website form submissions.\n' +
      'How: A minimal Express server (Node >=20, private repo) — no external sync stack, just HTTP endpoints.',
  },
];

async function postUpdate(itemId, bodyText) {
  const data = await mondayRequest(
    `mutation ($itemId: ID!, $body: String!) {
      create_update(item_id: $itemId, body: $body) { id }
    }`,
    { itemId: String(itemId), body: bodyText },
  );
  return data.create_update.id;
}

(async () => {
  const cols = await ensureColumns(BOARD_ID, [{ key: 'stack', title: 'Tech Stack', type: 'text' }]);
  const stackColId = cols.stack.id;
  const groupId = await ensureGroup(BOARD_ID, GROUP_TITLE);

  for (const row of ROWS) {
    const cv = { [stackColId]: row.stack };
    const existing = await findItemByName(BOARD_ID, groupId, row.name);
    let itemId;
    if (existing) {
      await updateItem(BOARD_ID, existing, cv);
      itemId = existing;
      console.log('updated:', row.name);
    } else {
      itemId = await createItem(BOARD_ID, groupId, row.name, cv);
      console.log('created:', row.name, '->', itemId);
    }
    await sleep(400); // stay under rate limits

    const updateId = await postUpdate(itemId, row.body);
    console.log('  posted update:', updateId);
    await sleep(400); // stay under rate limits
  }
  console.log('Done.');
})().catch((e) => { console.error(e); process.exit(1); });
