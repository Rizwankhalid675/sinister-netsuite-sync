const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const handbookPath = path.join(root, 'docs/SINISTER-DIESEL-V2-WEBSITE-HANDBOOK.md');
assert.ok(fs.existsSync(handbookPath), 'the canonical V2 website handbook must exist');
const handbook = fs.readFileSync(handbookPath, 'utf8');

for (const heading of [
  'Executive Summary', 'Company and Brand Context', 'Website Mission and Business Value',
  'Technical Architecture', 'Customer Journeys', 'Integrations and External Services',
  'Problems Tackled and Resolutions', 'Why the Project Took Time', 'Quality Assurance',
  'Current Release Position', 'Remaining Work', 'Publication and Rollback Runbook',
  'Maintenance and Ownership', '30 / 60 / 90-Day Roadmap', 'File Map and Command Reference'
]) assert.match(handbook, new RegExp(`^## ${heading}$`, 'm'), `missing handbook section: ${heading}`);

assert.match(handbook, /```mermaid[\s\S]*?flowchart/, 'handbook must include an architecture diagram');
assert.match(handbook, /\| Status \| Owner \| Release impact \| Next action \|/, 'remaining work must assign ownership and actions');
assert.match(handbook, /Revamp_v2[\s\S]*preview/i, 'handbook must state that Revamp_v2 is a preview branch');
assert.match(handbook, /MMT[\s\S]*No files modified/i, 'handbook must record the verified MMT state');
assert.doesNotMatch(handbook, /(MONDAY_API_TOKEN|RECAPTCHA_SECRET|BEGIN (RSA|OPENSSH) PRIVATE KEY|BranchKey\s*=)/i, 'handbook must not expose secrets');
console.log('V2 website handbook structure, readiness language, and secret safety verified');
