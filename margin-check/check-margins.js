require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { suiteQL } = require('../netsuite');
const { vendorRules, fordRule, sellingPriceLevel } = require('./vendors.config');

function resolveRule(vendorName) {
  const rule = vendorRules.find(r => r.match.test(vendorName));
  if (rule) return { label: rule.label, minMargin: rule.minMargin };
  if (fordRule.match.test(vendorName)) return { label: fordRule.label, tiers: fordRule.tiers };
  return null;
}

function minMarginFor(rule, price) {
  if (rule.minMargin != null) return rule.minMargin;
  const tier = rule.tiers.find(t => price <= t.maxPrice);
  return tier.minMargin;
}

async function getTrackedItems() {
  // itemvendor.vendorcost = actual 3rd-party cost; item.itemid/displayname for identification
  const rows = await suiteQL(`
    SELECT i.id AS itemid_internal, i.itemid AS sku, i.displayname,
           iv.vendorcost, v.companyname AS vendorname
    FROM itemvendor iv
    INNER JOIN item i ON i.id = iv.item
    INNER JOIN vendor v ON v.id = iv.vendor
    WHERE i.isinactive = 'F' AND iv.vendorcost > 0
  `);
  return rows;
}

async function getSellingPrices(itemIds) {
  const priceMap = {};
  for (let i = 0; i < itemIds.length; i += 200) {
    const chunk = itemIds.slice(i, i + 200);
    const rows = await suiteQL(
      `SELECT item, price FROM itemprice WHERE pricelevelname = '${sellingPriceLevel}' AND item IN (${chunk.join(',')})`
    );
    for (const r of rows) priceMap[r.item] = parseFloat(r.price);
  }
  return priceMap;
}

async function checkMargins() {
  const items = await getTrackedItems();

  const relevant = items
    .map(row => ({ ...row, rule: resolveRule(row.vendorname) }))
    .filter(row => row.rule);

  const priceMap = await getSellingPrices(relevant.map(r => r.itemid_internal));

  const discrepancies = [];
  for (const row of relevant) {
    const price = priceMap[row.itemid_internal];
    const cost = parseFloat(row.vendorcost);
    if (!price || price <= 0) {
      discrepancies.push({
        sku: row.sku, displayname: row.displayname, vendor: row.vendorname,
        issue: 'MISSING_PRICE', cost, price: null, actualMargin: null, requiredMargin: null
      });
      continue;
    }

    const actualMargin = (price - cost) / price;
    const requiredMargin = minMarginFor(row.rule, price);

    if (actualMargin < requiredMargin - 0.0001) {
      discrepancies.push({
        sku: row.sku,
        displayname: row.displayname,
        vendor: row.vendorname,
        rule: row.rule.label,
        cost,
        price,
        actualMargin: +(actualMargin * 100).toFixed(2),
        requiredMargin: +(requiredMargin * 100).toFixed(2),
        shortfallPct: +((requiredMargin - actualMargin) * 100).toFixed(2),
        suggestedPrice: +(cost / (1 - requiredMargin)).toFixed(2)
      });
    }
  }

  discrepancies.sort((a, b) => (b.shortfallPct || 0) - (a.shortfallPct || 0));
  return discrepancies;
}

async function main() {
  const discrepancies = await checkMargins();

  const outDir = path.join(__dirname, 'reports');
  fs.mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().slice(0, 10);
  const outPath = path.join(outDir, `margin-discrepancies-${stamp}.csv`);

  const header = 'SKU,Name,Vendor,Rule,Cost,SellingPrice,ActualMarginPct,RequiredMarginPct,ShortfallPct,SuggestedPrice,Issue\n';
  const lines = discrepancies.map(d => [
    d.sku, `"${(d.displayname || '').replace(/"/g, '""')}"`, d.vendor, d.rule || '',
    d.cost ?? '', d.price ?? '', d.actualMargin ?? '', d.requiredMargin ?? '',
    d.shortfallPct ?? '', d.suggestedPrice ?? '', d.issue || ''
  ].join(','));

  fs.writeFileSync(outPath, header + lines.join('\n'));

  console.log(`Checked margins. Found ${discrepancies.length} discrepancies.`);
  console.log(`Report written to: ${outPath}`);
}

if (require.main === module) {
  main().catch(err => {
    console.error('Margin check failed:', err.message);
    process.exit(1);
  });
}

module.exports = { checkMargins };
