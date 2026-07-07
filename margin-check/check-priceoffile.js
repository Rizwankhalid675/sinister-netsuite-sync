require('dotenv').config();
const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const { suiteQL } = require('../netsuite');
const { getActiveProductCodes } = require('../miva');
const { generateMarginReviewPdf } = require('./pdf-report');

const PRICE_FILE = path.join(__dirname, 'price-files', '2026-06-22_ Holley Price File.xlsx');
const ACTIVE_SHEETS = ['06.22 All', 'Memory Impacted Skus', '06.22 Overstock Sale'];

// Confirmed with Amanda Morales (2026-07-06): Sinister's Holley/Edge account is Platinum tier.
const COST_TIER = 'Platinum';

// Confirmed with Amanda Morales (2026-07-06): Sinister does not source B&M through Holley — exclude.
const EXCLUDED_BRANDS = ['B&M'];

function loadPriceFile() {
  const wb = XLSX.readFile(PRICE_FILE);
  const bySku = new Map();
  for (const sheetName of ACTIVE_SHEETS) {
    const ws = wb.Sheets[sheetName];
    if (!ws) continue;
    const rows = XLSX.utils.sheet_to_json(ws, { defval: null });
    for (const r of rows) {
      const sku = String(r.Item || '').trim();
      if (!sku) continue;
      if (EXCLUDED_BRANDS.includes(r.Brand)) continue;
      bySku.set(sku, {
        brand: r.Brand,
        status: r.Item_Status,
        cost: typeof r[COST_TIER] === 'number' ? r[COST_TIER] : null,
        map: typeof r.MAP === 'number' ? r.MAP : null,
        srp: typeof r.SRP === 'number' ? r.SRP : null,
        sheet: sheetName
      });
    }
  }
  return bySku;
}

async function getNetsuiteItems() {
  // Only items whose SKU exists in the price file are worth checking; pull all active items and filter in JS
  return await suiteQL(`SELECT id, itemid AS sku, cost FROM item WHERE isinactive = 'F'`);
}

async function getItemVendorNames(itemIds) {
  // SKUs can collide across unrelated vendors (e.g. NS "7006" = SCT/Derive Power, unrelated to
  // Holley's "7006" = Weiand). Require the NetSuite purchasing vendor to actually be Holley/Edge
  // family before trusting a SKU-string match.
  const vendorMap = {};
  for (let i = 0; i < itemIds.length; i += 200) {
    const chunk = itemIds.slice(i, i + 200);
    const rows = await suiteQL(
      `SELECT iv.item, v.companyname FROM itemvendor iv INNER JOIN vendor v ON v.id = iv.vendor WHERE iv.item IN (${chunk.join(',')})`
    );
    for (const r of rows) {
      if (!vendorMap[r.item]) vendorMap[r.item] = [];
      vendorMap[r.item].push(r.companyname);
    }
  }
  return vendorMap;
}

const HOLLEY_VENDOR_PATTERN = /holley|edge products/i;

async function getMapPrices(itemIds) {
  const priceMap = {};
  for (let i = 0; i < itemIds.length; i += 200) {
    const chunk = itemIds.slice(i, i + 200);
    const rows = await suiteQL(
      `SELECT item, price FROM itemprice WHERE pricelevelname = 'MAP' AND item IN (${chunk.join(',')})`
    );
    for (const r of rows) priceMap[r.item] = parseFloat(r.price);
  }
  return priceMap;
}

async function runCheck() {
  console.log('Loading Holley/Edge price file...');
  const priceFile = loadPriceFile();
  console.log(`Loaded ${priceFile.size} SKUs from price file.`);

  console.log('Fetching NetSuite items...');
  const nsItems = await getNetsuiteItems();

  console.log('Fetching active Miva website product codes...');
  const activeOnSite = await getActiveProductCodes();
  console.log(`${activeOnSite.size} active products on the website.`);

  const skuMatched = nsItems
    .map(i => ({ ...i, fileEntry: priceFile.get(i.sku) }))
    .filter(i => i.fileEntry);

  console.log(`${skuMatched.length} NetSuite items match a SKU in the price file (before vendor check).`);

  const vendorNames = await getItemVendorNames(skuMatched.map(m => m.id));

  const matched = [];
  const rejectedCollisions = [];
  for (const item of skuMatched) {
    const vendors = vendorNames[item.id] || [];
    const isHolleyVendor = vendors.some(v => HOLLEY_VENDOR_PATTERN.test(v));
    if (isHolleyVendor) {
      matched.push(item);
    } else {
      rejectedCollisions.push({ sku: item.sku, actualVendors: vendors.join('; ') || 'none on file' });
    }
  }

  console.log(`${matched.length} confirmed as real Holley/Edge vendor matches.`);
  if (rejectedCollisions.length) {
    console.log(`Rejected ${rejectedCollisions.length} SKU collisions (same SKU string, different actual vendor):`);
    for (const r of rejectedCollisions) console.log(`  ${r.sku} -> ${r.actualVendors}`);
  }

  const mapPrices = await getMapPrices(matched.map(m => m.id));

  const issues = [];
  for (const item of matched) {
    const { fileEntry } = item;
    const nsCost = parseFloat(item.cost) || null;
    const nsMap = mapPrices[item.id] || null;

    const soldOnSite = activeOnSite.has(item.sku);

    if (fileEntry.status !== 'Active') {
      issues.push({
        sku: item.sku, brand: fileEntry.brand, issue: 'NOT_ACTIVE_IN_PRICE_FILE',
        detail: fileEntry.status, soldOnSite: soldOnSite ? 'Yes' : 'No'
      });
      continue;
    }

    if (!soldOnSite) {
      issues.push({ sku: item.sku, brand: fileEntry.brand, issue: 'NOT_SOLD_ON_WEBSITE', soldOnSite: 'No' });
    }

    const costMismatch = fileEntry.cost != null && nsCost != null && Math.abs(fileEntry.cost - nsCost) > 0.01;
    const mapMismatch = fileEntry.map != null && nsMap != null && Math.abs(fileEntry.map - nsMap) > 0.01;

    if (costMismatch || mapMismatch) {
      issues.push({
        sku: item.sku, brand: fileEntry.brand, issue: 'PRICE_MISMATCH',
        nsCost, fileCost: fileEntry.cost, costDiff: costMismatch ? +(nsCost - fileEntry.cost).toFixed(2) : null,
        nsMap, fileMap: fileEntry.map, mapDiff: mapMismatch ? +(nsMap - fileEntry.map).toFixed(2) : null
      });
    }

    if (fileEntry.cost != null && nsCost == null) {
      issues.push({ sku: item.sku, brand: fileEntry.brand, issue: 'MISSING_NS_COST', fileValue: fileEntry.cost });
    }
  }

  const outDir = path.join(__dirname, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const csvPath = path.join(outDir, `holley-edge-price-file-check-${stamp}.csv`);
  const pdfPath = path.join(outDir, `holley-edge-price-file-check-${stamp}.pdf`);

  const header = 'SKU,Brand,Issue,NS_Cost,File_Cost,Cost_Diff,NS_MAP,File_MAP,MAP_Diff,SoldOnSite,Detail\n';
  const lines = issues.map(i => [
    i.sku, i.brand, i.issue,
    i.nsCost ?? '', i.fileCost ?? '', i.costDiff ?? '',
    i.nsMap ?? '', i.fileMap ?? '', i.mapDiff ?? '',
    i.soldOnSite ?? '', i.detail ?? ''
  ].join(','));
  fs.writeFileSync(csvPath, header + lines.join('\n'));

  const obsoleteActive = issues.filter(i => i.issue === 'NOT_ACTIVE_IN_PRICE_FILE');
  const notOnWebsite = issues.filter(i => i.issue === 'NOT_SOLD_ON_WEBSITE');
  const fmt = (n) => n == null ? '—' : n.toFixed(2);
  const fmtDiff = (n) => n == null ? '—' : (n >= 0 ? '+' : '') + n.toFixed(2);
  const priceMismatches = issues
    .filter(i => i.issue === 'PRICE_MISMATCH')
    .map(i => ({
      sku: i.sku, brand: i.brand,
      nsCost: fmt(i.nsCost), fileCost: fmt(i.fileCost), costDiff: fmtDiff(i.costDiff),
      nsMap: fmt(i.nsMap), fileMap: fmt(i.fileMap), mapDiff: fmtDiff(i.mapDiff)
    }));

  generateMarginReviewPdf({
    outPath: pdfPath,
    meta: {
      priceFileLabel: path.basename(PRICE_FILE),
      costTier: COST_TIER,
      generatedAt: new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })
    },
    obsoleteActive,
    notOnWebsite,
    priceMismatches,
    rejectedCollisions
  });

  console.log(`Found ${issues.length} price-file discrepancies.`);
  console.log(`CSV written to: ${csvPath}`);
  console.log(`PDF written to: ${pdfPath}`);

  return {
    csvPath, pdfPath,
    csvFile: path.basename(csvPath), pdfFile: path.basename(pdfPath),
    totalIssues: issues.length,
    obsoleteCount: obsoleteActive.length,
    notOnWebsiteCount: notOnWebsite.length,
    priceMismatchCount: priceMismatches.length,
    rejectedCollisionCount: rejectedCollisions.length
  };
}

module.exports = { runCheck };

if (require.main === module) {
  runCheck().catch(err => {
    console.error('Price file check failed:', err.message);
    process.exit(1);
  });
}
