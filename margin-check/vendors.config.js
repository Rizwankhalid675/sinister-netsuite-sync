// 3rd-party vendor margin targets, per Brian George — 1/1/26
// margin = (price - cost) / price
module.exports = {
  vendorRules: [
    { match: /garrett/i,            minMargin: 0.35, label: 'GARRET' },
    { match: /mbrp/i,               minMargin: 0.40, label: 'MBRP' },
    { match: /^edge products$/i,    minMargin: 0.35, label: 'EDGE' },
    { match: /fass/i,               minMargin: 0.35, label: 'FASS' },
    { match: /\bsct\b/i,            minMargin: 0.30, label: 'SCT' },
    { match: /turn\s?14|apg/i,      minMargin: 0.40, label: 'TURN14/APG' }
  ],

  // Ford has a price-tiered rule instead of a flat vendor rule
  fordRule: {
    match: /ford/i,
    label: 'FORD',
    tiers: [
      { maxPrice: 80, minMargin: 0.40 },   // Ford under $80 -> 40%
      { maxPrice: Infinity, minMargin: 0.35 } // Ford over $80 -> 35%
    ]
  },

  // NetSuite price level used as the "selling price" for margin comparisons
  sellingPriceLevel: 'MAP'
};
