const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');

const root = path.resolve(__dirname, '..');
const proof = path.join(root, 'reports', 'Sinister-Diesel-V2-Performance-Proof-Pack.pdf');
const handbook = path.join(root, 'reports', 'Sinister-Diesel-V2-Website-Handbook.pdf');
const evidence = path.join(root, 'reports', 'performance-proof-pack', 'v2-performance-results.json');

function inspectPdf(file, minimumBytes, minimumPages) {
  assert.ok(fs.existsSync(file), `${path.basename(file)} must exist`);
  const buffer = fs.readFileSync(file);
  assert.equal(buffer.subarray(0, 5).toString('ascii'), '%PDF-', 'artifact must be a PDF');
  assert.ok(buffer.length >= minimumBytes, `${path.basename(file)} is unexpectedly small`);
  const body = buffer.toString('latin1');
  const pages = (body.match(/\/Type\s*\/Page\b/g) || []).length;
  assert.ok(pages >= minimumPages, `${path.basename(file)} must contain at least ${minimumPages} pages`);
  assert.doesNotMatch(body, /BranchKey=[A-Za-z0-9_-]{12,}/, 'preview credentials must not appear in PDFs');
}

test('performance proof pack and handbook are complete, sanitized PDFs', () => {
  inspectPdf(proof, 500_000, 8);
  inspectPdf(handbook, 75_000, 25);
});

test('performance evidence preserves the measured legacy and V2 results', () => {
  const raw = fs.readFileSync(evidence, 'utf8');
  assert.doesNotMatch(raw, /BranchKey=[A-Za-z0-9_-]{12,}/);
  const data = JSON.parse(raw);

  assert.equal(data.gtmetrix.legacy.performance, 59);
  assert.equal(data.gtmetrix.v2.performance, 51);
  assert.equal(data.gtmetrix.legacy.structure, 77);
  assert.equal(data.gtmetrix.v2.structure, 90);
  assert.equal(data.controlled_lighthouse.median.legacy.requests, 169);
  assert.equal(data.controlled_lighthouse.median.v2.requests, 82);
  assert.equal(data.semrush_legacy.site_health_percent, 83);
});
