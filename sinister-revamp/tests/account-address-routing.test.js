const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const accountSources = [
  'templates/acln.mvt',
  'partials/sd2-v2-account-dashboard.mvt',
  'partials/sd2-v2-account-quick-actions.mvt'
];

test('account address-list links use CABK instead of the ACAD add-address route', () => {
  for (const file of accountSources) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    assert.doesNotMatch(source, /&mvte:urls:ACAD:auto;/, `${file} must not send address-list links to ACAD`);
    assert.match(source, /&mvte:urls:CABK:auto;/, `${file} must link to the CABK address book`);
  }
});
