require('dotenv').config();
const { buildSkuCandidates, normalizeOptionSuffix } = require('./flows/ordersToNetsuite');
const { getItemIdBySku } = require('./netsuite');

const sampleCases = [
  {
    label: 'SD-CAI-5.9-94 with cai_filter=Dry (real order), two placeholder no-thanks options',
    baseSku: 'SD-CAI-5.9-94',
    options: [
      { attribute: '-add_pre-filter', value: 'no-thanks', attr_prompt: 'Add Pre Filter', opt_prompt: 'No Thanks' },
      { attribute: '-add_cleaning_kit', value: 'no-thanks', attr_prompt: 'Add Cleaning Kit', opt_prompt: 'No Thanks' },
      { attribute: 'cai_filter', value: 'Dry', attr_prompt: 'CAI Filter', opt_prompt: 'Dry Filter Element' }
    ],
    expectMatch: 'SD-CAI-5.9-94-DRY'
  },
  {
    label: 'SD-6.7PIPK11-01-20 with only shipping_preference option (should NOT append a suffix)',
    baseSku: 'SD-6.7PIPK11-01-20',
    options: [
      { attribute: 'shipping_preference', value: 'ship_separate', attr_prompt: 'Shipping Preference:', opt_prompt: 'Ship Cold Side Now, Hot Side Ships When Ready' }
    ],
    expectMatch: 'SD-6.7PIPK11-01-20'
  },
  {
    label: 'SD-UPFS-01-20 with no options at all',
    baseSku: 'SD-UPFS-01-20',
    options: undefined,
    expectMatch: 'SD-UPFS-01-20'
  },
  {
    label: 'SD-CK-FILTER with no options at all',
    baseSku: 'SD-CK-FILTER',
    options: undefined,
    expectMatch: 'SD-CK-FILTER'
  }
];

async function main() {
  let allPass = true;
  for (const c of sampleCases) {
    const candidates = buildSkuCandidates(c.baseSku, c.options);
    let resolvedId = null;
    let resolvedSku = null;
    for (const candidate of candidates) {
      const id = await getItemIdBySku(candidate);
      if (id) { resolvedId = id; resolvedSku = candidate; break; }
    }
    const pass = resolvedSku === c.expectMatch;
    allPass = allPass && pass;
    console.log(`${pass ? '✅' : '❌'} ${c.label}`);
    console.log(`   candidates tried: ${JSON.stringify(candidates)}`);
    console.log(`   resolved: ${resolvedSku || 'NONE'} (NS id ${resolvedId || 'n/a'}), expected: ${c.expectMatch}`);
  }
  console.log(allPass ? '\nALL DRY-RUN CASES PASSED' : '\nSOME DRY-RUN CASES FAILED');
  process.exit(allPass ? 0 : 1);
}

main().catch(e => { console.error('ERR', e); process.exit(1); });
