// One-off local conversion: Holley price file XLSX -> a single flat CSV containing
// only the columns check-priceoffile.js needs. Run this locally whenever a new price
// file arrives (this box has RAM to spare for XLSX parsing; the production server does
// not), then upload the resulting CSV to the server instead of the XLSX.
//
// Usage: node margin-check/convert-price-file.js "path/to/Holley Price File.xlsx"

const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const ACTIVE_SHEETS = ['06.22 All', 'Memory Impacted Skus', '06.22 Overstock Sale'];
const COST_TIER = 'Platinum';

const inPath = process.argv[2];
if (!inPath) {
  console.error('Usage: node convert-price-file.js "path/to/price-file.xlsx"');
  process.exit(1);
}

const wb = XLSX.readFile(inPath);
const outPath = path.join(
  path.dirname(inPath),
  path.basename(inPath, path.extname(inPath)) + '.csv'
);

const csvEscape = (v) => {
  if (v == null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const out = fs.createWriteStream(outPath);
out.write('Sheet,Item,Brand,Item_Status,Cost,MAP,SRP\n');

let rowCount = 0;
for (const sheetName of ACTIVE_SHEETS) {
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.warn(`Sheet not found, skipping: ${sheetName}`);
    continue;
  }
  const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  for (const r of rows) {
    const sku = String(r.Item || '').trim();
    if (!sku) continue;
    const cost = typeof r[COST_TIER] === 'number' ? r[COST_TIER] : '';
    const map = typeof r.MAP === 'number' ? r.MAP : '';
    const srp = typeof r.SRP === 'number' ? r.SRP : '';
    out.write([
      csvEscape(sheetName), csvEscape(sku), csvEscape(r.Brand),
      csvEscape(r.Item_Status), cost, map, srp
    ].join(',') + '\n');
    rowCount++;
  }
}
out.end(() => {
  console.log(`Wrote ${rowCount} rows to ${outPath}`);
});
