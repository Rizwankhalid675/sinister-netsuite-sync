const PDFDocument = require('pdfkit');
const fs = require('fs');

const COLORS = {
  ink: '#1c1f26',
  muted: '#6b6459',
  rule: '#ddd8cd',
  pine: '#3d6b52',
  brick: '#a83232',
  amber: '#92650f'
};

function verdictColor(verdict) {
  if (verdict === 'DEACTIVATE') return COLORS.pine;
  if (verdict === 'REVIEW') return COLORS.brick;
  return COLORS.amber;
}

function drawHeader(doc, title, subtitle) {
  const left = doc.page.margins.left;
  doc.x = left;
  doc.fontSize(18).fillColor(COLORS.ink).font('Helvetica-Bold').text(title, left, doc.y, { width: 532 });
  doc.moveDown(0.3);
  doc.x = left;
  doc.fontSize(10).fillColor(COLORS.muted).font('Helvetica').text(subtitle, left, doc.y, { width: 532 });
  doc.moveDown(0.8);
  doc.x = left;
  doc.strokeColor(COLORS.rule).lineWidth(1)
    .moveTo(left, doc.y).lineTo(doc.page.width - doc.page.margins.right, doc.y).stroke();
  doc.moveDown(0.8);
  doc.x = left;
}

function drawSection(doc, heading, note, verdict) {
  const left = doc.page.margins.left;
  if (doc.y > doc.page.height - 150) { doc.addPage(); }
  doc.x = left;
  doc.fontSize(13).fillColor(COLORS.ink).font('Helvetica-Bold').text(heading, left, doc.y, { width: 532 });
  doc.moveDown(0.15);
  doc.x = left;
  if (verdict) {
    doc.fontSize(9).fillColor(verdictColor(verdict)).font('Helvetica-Bold').text(verdict, left, doc.y);
    doc.moveDown(0.15);
    doc.x = left;
  }
  if (note) {
    doc.fontSize(9.5).fillColor(COLORS.muted).font('Helvetica').text(note, left, doc.y, { width: 480 });
  }
  doc.moveDown(0.5);
  doc.x = left;
}

function drawTable(doc, columns, rows) {
  const startX = doc.page.margins.left;
  const colWidths = columns.map(c => c.width);
  const rowHeight = 16;
  const tableWidth = colWidths.reduce((a, b) => a + b, 0);

  function drawRow(values, opts = {}) {
    if (doc.y > doc.page.height - doc.page.margins.bottom - rowHeight) {
      doc.addPage();
      doc.x = startX;
    }
    let x = startX;
    const y = doc.y;
    doc.fontSize(opts.header ? 8.5 : 9)
      .font(opts.header ? 'Helvetica-Bold' : 'Helvetica')
      .fillColor(opts.header ? COLORS.muted : COLORS.ink);
    values.forEach((v, i) => {
      doc.text(String(v), x, y, { width: colWidths[i], align: columns[i].align || 'left', lineBreak: false });
      x += colWidths[i];
    });
    doc.x = startX;
    doc.y = y + rowHeight;
  }

  doc.x = startX;
  drawRow(columns.map(c => c.label), { header: true });
  doc.strokeColor(COLORS.rule).lineWidth(0.5)
    .moveTo(startX, doc.y).lineTo(startX + tableWidth, doc.y).stroke();
  doc.moveDown(0.2);
  doc.x = startX;

  for (const row of rows) drawRow(row);
  doc.x = startX;
  doc.moveDown(0.6);
}

function generateMarginReviewPdf({ outPath, meta, obsoleteActive, notOnWebsite, priceMismatches, rejectedCollisions }) {
  const doc = new PDFDocument({ margin: 40, size: 'LETTER', bufferPages: true });
  doc.pipe(fs.createWriteStream(outPath));

  drawHeader(
    doc,
    'Holley/Edge Margin & SKU Review',
    `Price file: ${meta.priceFileLabel}  |  Cost tier: ${meta.costTier}  |  Generated: ${meta.generatedAt}`
  );

  doc.fontSize(9.5).fillColor(COLORS.ink).font('Helvetica')
    .text(
      'Every SKU below has been vendor-verified: the NetSuite purchasing vendor on the item ' +
      'must actually be Holley/Edge Products before a price-file match is trusted. This prevents ' +
      'false matches where an unrelated vendor happens to reuse the same short SKU (e.g. NetSuite ' +
      '"7006" is an SCT/Derive Power part, not Weiand — excluded below).',
      { width: 500 }
    );
  doc.moveDown(1);

  // Section 1
  drawSection(
    doc,
    `1 — Obsolete in Holley's file, still active in NetSuite (${obsoleteActive.length} SKUs)`,
    'Holley/Edge marked these discontinued (status OBS). Vendor-verified as genuine Edge purchases.',
    'DEACTIVATE — pending your review'
  );
  drawTable(
    doc,
    [{ label: 'SKU', width: 140 }, { label: 'Brand', width: 100 }, { label: 'Status in file', width: 120 }],
    obsoleteActive.map(r => [r.sku, r.brand, r.detail])
  );

  // Section 2
  drawSection(
    doc,
    `2 — Active in Holley's file AND matched in NetSuite, not found on the live website (${notOnWebsite.length} SKUs)`,
    'Vendor-verified genuine Edge items, still active in both Holley\'s file and NetSuite. Not present in Miva\'s active product list.',
    'DEACTIVATE — pending your review'
  );
  drawTable(
    doc,
    [{ label: 'SKU', width: 140 }, { label: 'Brand', width: 100 }],
    notOnWebsite.map(r => [r.sku, r.brand])
  );

  // Section 3
  drawSection(
    doc,
    `3 — Cost / MAP mismatch vs. Holley's file (${priceMismatches.length} SKUs)`,
    'Still active and sold. One row per SKU — NetSuite vs. the Holley Platinum-tier file, cost and MAP side by side.',
    'REVIEW PRICING'
  );
  drawTable(
    doc,
    [
      { label: 'SKU', width: 78 }, { label: 'Brand', width: 46 },
      { label: 'NS Cost', width: 62, align: 'right' }, { label: 'File Cost', width: 62, align: 'right' }, { label: 'Diff Cost', width: 62, align: 'right' },
      { label: 'NS MAP', width: 62, align: 'right' }, { label: 'File MAP', width: 62, align: 'right' }, { label: 'Diff MAP', width: 62, align: 'right' }
    ],
    priceMismatches.map(r => [r.sku, r.brand, r.nsCost, r.fileCost, r.costDiff, r.nsMap, r.fileMap, r.mapDiff])
  );

  // Rejected collisions appendix
  if (rejectedCollisions && rejectedCollisions.length) {
    drawSection(
      doc,
      `Appendix — SKU collisions excluded (${rejectedCollisions.length})`,
      'Same SKU string appears in Holley\'s file, but NetSuite\'s actual vendor for these items is unrelated. Not included above.',
      null
    );
    drawTable(
      doc,
      [{ label: 'SKU', width: 140 }, { label: 'Actual NetSuite vendor', width: 300 }],
      rejectedCollisions.map(r => [r.sku, r.actualVendors])
    );
  }

  doc.end();
}

module.exports = { generateMarginReviewPdf };
