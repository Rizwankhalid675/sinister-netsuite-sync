const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const branch = 'https://sinisterdiesel.com/?BranchKey=b5afdddae9601468481279b3c52b007d';
const products = [
  ['intake', 'https://sinisterdiesel.com/sinister-diesel-cold-air-intake-for-2001-2004-chevygmc-duramax-66l-lb7.html'],
  ['filter', 'https://sinisterdiesel.com/sinister-diesel-bypass-oil-filter-system-for-1999-2003-ford-powerstroke-73l.html']
];
const sizes = [
  ['desktop', { width: 1440, height: 1000 }],
  ['mobile', { width: 390, height: 844 }]
];

(async () => {
  const browser = await chromium.launch({ headless: true });
  const outDir = path.resolve(__dirname, '../../reports/qa/pdp-overview');
  fs.mkdirSync(outDir, { recursive: true });
  const results = [];

  for (const [sizeName, viewport] of sizes) {
    const context = await browser.newContext({ viewport, isMobile: sizeName === 'mobile' });
    const page = await context.newPage();
    await page.goto(branch, { waitUntil: 'domcontentloaded', timeout: 60000 });

    for (const [productName, url] of products) {
      const consoleErrors = [];
      page.removeAllListeners('console');
      page.on('console', message => {
        if (message.type() === 'error') consoleErrors.push(message.text());
      });
      const response = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60000 });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(1500);

      const metrics = await page.evaluate(() => {
        const nav = document.querySelector('.sd2-v2-product-tabs');
        const overview = document.querySelector('#description');
        const copy = overview && overview.querySelector('.sd2-v2-pdp-copy');
        const media = copy ? [...copy.querySelectorAll('img,iframe,video')] : [];
        const brokenImages = media.filter(el => el.tagName === 'IMG' && (!el.complete || el.naturalWidth === 0));
        const overflowingMedia = media.filter(el => el.getBoundingClientRect().width > copy.getBoundingClientRect().width + 1);
        const tables = copy ? [...copy.querySelectorAll('table')] : [];
        const navRect = nav && nav.getBoundingClientRect();
        const overviewRect = overview && overview.getBoundingClientRect();
        return {
          title: document.title,
          navBeforeOverview: !!(nav && overview && (nav.compareDocumentPosition(overview) & Node.DOCUMENT_POSITION_FOLLOWING)),
          navBottom: navRect && Math.round(navRect.bottom + scrollY),
          overviewTop: overviewRect && Math.round(overviewRect.top + scrollY),
          descriptionCharacters: copy ? copy.innerText.trim().length : 0,
          mediaCount: media.length,
          tableCount: tables.length,
          brokenImages: brokenImages.map(img => img.currentSrc || img.src),
          overflowingMedia: overflowingMedia.map(el => el.tagName),
          pageOverflowX: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth),
          copyFont: copy && getComputedStyle(copy).fontFamily,
          copyFontSize: copy && getComputedStyle(copy).fontSize,
          copyLineHeight: copy && getComputedStyle(copy).lineHeight
        };
      });

      await page.locator('.sd2-v2-product-tabs').scrollIntoViewIfNeeded();
      await page.waitForTimeout(300);
      const screenshot = path.join(outDir, `${productName}-${sizeName}.png`);
      await page.screenshot({ path: screenshot, fullPage: false });
      await page.locator('#description').scrollIntoViewIfNeeded();
      await page.mouse.wheel(0, 220);
      await page.waitForTimeout(2200);
      const overviewScreenshot = path.join(outDir, `${productName}-${sizeName}-overview.png`);
      await page.screenshot({ path: overviewScreenshot, fullPage: false });
      results.push({
        productName,
        sizeName,
        status: response && response.status(),
        url: page.url(),
        ...metrics,
        consoleErrors: [...new Set(consoleErrors)]
      });
    }
    await context.close();
  }

  const reportPath = path.join(outDir, 'report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
  await browser.close();
})().catch(error => {
  console.error(error);
  process.exit(1);
});
