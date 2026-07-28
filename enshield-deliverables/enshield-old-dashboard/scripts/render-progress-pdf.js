const path = require("path");
const { pathToFileURL } = require("url");
const { chromium } = require("playwright");

(async () => {
  const htmlPath = path.join(__dirname, "..", "docs", "task11-boss-progress-summary.html");
  const outPath = path.join(__dirname, "..", "docs", "task11-boss-progress-summary-pretty.pdf");
  const url = pathToFileURL(htmlPath).href;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: "networkidle" });
  await page.pdf({ path: outPath, printBackground: true, format: "A4" });
  await browser.close();
  console.log("PDF written:", outPath);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
