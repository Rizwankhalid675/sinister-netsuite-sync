const fs = require("fs");
const path = require("path");

function pdfEscape(s) {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function wrap(line, width) {
  if (line.length <= width) return [line];
  const words = line.split(" ");
  const out = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > width) {
      if (cur) out.push(cur);
      cur = w;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur) out.push(cur);
  return out;
}

const srcPath = path.join(__dirname, "..", "docs", "task11-boss-progress-summary.md");
const outPath = path.join(__dirname, "..", "docs", "task11-boss-progress-summary.pdf");

const md = fs.readFileSync(srcPath, "utf8");
const rawLines = md.split(/\r?\n/);

const pageWidth = 612, pageHeight = 792;
const marginLeft = 50, marginTop = 742, marginBottom = 50;
const lineHeight = 14;
const maxCharsBody = 95;
const maxCharsHeading = 80;

const content = [];
for (const raw of rawLines) {
  const line = raw;
  if (line.trim() === "") {
    content.push({ text: "", size: 11, bold: false, indent: 0 });
    continue;
  }
  let m;
  if ((m = line.match(/^#\s+(.*)/))) {
    for (const w of wrap(m[1], maxCharsHeading)) content.push({ text: w, size: 18, bold: true, indent: 0 });
    content.push({ text: "", size: 11, bold: false, indent: 0 });
  } else if ((m = line.match(/^##\s+(.*)/))) {
    content.push({ text: "", size: 11, bold: false, indent: 0 });
    for (const w of wrap(m[1], maxCharsHeading)) content.push({ text: w, size: 14, bold: true, indent: 0 });
  } else if ((m = line.match(/^###\s+(.*)/))) {
    content.push({ text: "", size: 11, bold: false, indent: 0 });
    for (const w of wrap(m[1], maxCharsHeading)) content.push({ text: w, size: 12, bold: true, indent: 0 });
  } else if ((m = line.match(/^-\s+(.*)/))) {
    const wrapped = wrap("- " + m[1].replace(/\*\*/g, ""), maxCharsBody);
    wrapped.forEach((w, i) => content.push({ text: i === 0 ? w : "  " + w, size: 10.5, bold: false, indent: 10 }));
  } else if ((m = line.match(/^\|(.*)\|$/))) {
    const cleaned = line.replace(/\|/g, " | ").replace(/-{3,}/g, "").trim();
    for (const w of wrap(cleaned, maxCharsBody)) content.push({ text: w, size: 9.5, bold: false, indent: 0 });
  } else {
    const cleaned = line.replace(/\*\*/g, "");
    for (const w of wrap(cleaned, maxCharsBody)) content.push({ text: w, size: 10.5, bold: false, indent: 0 });
  }
}

const pages = [];
let cur = [];
let y = marginTop;
for (const item of content) {
  const h = item.size <= 11 ? lineHeight : item.size + 4;
  if (y - h < marginBottom) {
    pages.push(cur);
    cur = [];
    y = marginTop;
  }
  cur.push({ ...item, y });
  y -= h;
}
if (cur.length) pages.push(cur);

const pageObjNums = [];
const contentObjNums = [];
let nextNum = 5;
const numPages = pages.length;
for (let i = 0; i < numPages; i++) {
  pageObjNums.push(nextNum++);
  contentObjNums.push(nextNum++);
}

function buildContentStream(items) {
  const ops = [];
  for (const it of items) {
    const font = it.bold ? "/F2" : "/F1";
    ops.push("BT");
    ops.push(font + " " + it.size + " Tf");
    ops.push(marginLeft + it.indent + " " + it.y + " Td");
    ops.push("(" + pdfEscape(it.text) + ") Tj");
    ops.push("ET");
  }
  return ops.join("\n");
}

const pdfObjs = [];
pdfObjs[1] = "1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n";

const kids = pageObjNums.map((n) => n + " 0 R").join(" ");
pdfObjs[2] = "2 0 obj\n<< /Type /Pages /Kids [" + kids + "] /Count " + numPages + " >>\nendobj\n";

pdfObjs[3] = "3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n";
pdfObjs[4] = "4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>\nendobj\n";

for (let i = 0; i < numPages; i++) {
  const pnum = pageObjNums[i];
  const cnum = contentObjNums[i];
  pdfObjs[pnum] =
    pnum +
    " 0 obj\n<< /Type /Page /Parent 2 0 R /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /MediaBox [0 0 " +
    pageWidth +
    " " +
    pageHeight +
    "] /Contents " +
    cnum +
    " 0 R >>\nendobj\n";
  const stream = buildContentStream(pages[i]);
  pdfObjs[cnum] =
    cnum +
    " 0 obj\n<< /Length " +
    Buffer.byteLength(stream, "utf8") +
    " >>\nstream\n" +
    stream +
    "\nendstream\nendobj\n";
}

const totalObjs = nextNum - 1;
let pdf = "%PDF-1.4\n";
const offsets = [0];
for (let i = 1; i <= totalObjs; i++) {
  offsets.push(Buffer.byteLength(pdf, "utf8"));
  pdf += pdfObjs[i];
}
const xrefStart = Buffer.byteLength(pdf, "utf8");
pdf += "xref\n0 " + (totalObjs + 1) + "\n";
pdf += "0000000000 65535 f \n";
for (let i = 1; i <= totalObjs; i++) {
  pdf += String(offsets[i]).padStart(10, "0") + " 00000 n \n";
}
pdf += "trailer\n<< /Size " + (totalObjs + 1) + " /Root 1 0 R >>\nstartxref\n" + xrefStart + "\n%%EOF";

fs.writeFileSync(outPath, pdf, "binary");
console.log("PDF written:", outPath, "pages:", numPages, "bytes:", Buffer.byteLength(pdf, "binary"));
