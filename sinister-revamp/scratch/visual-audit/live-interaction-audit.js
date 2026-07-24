const { chromium } = require('playwright');

const ROOT = 'https://sinisterdiesel.com';
const BRANCH = `${ROOT}/?BranchKey=b5afdddae9601468481279b3c52b007d`;
const PDP = `${ROOT}/sinister-diesel-cold-air-intake-for-2001-2004-chevygmc-duramax-66l-lb7.html`;
const CATEGORY = `${ROOT}/ford-powerstroke-powerstroke-diesel-truck-parts-online.html`;
const results = [];

async function withPage(name, viewport, fn) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  try {
    await page.goto(BRANCH, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(800);
    await fn(page);
    results.push({ name, pass: true, pageErrors });
  } catch (error) {
    results.push({ name, pass: false, error: error.message, url: page.url(), pageErrors });
  } finally {
    await browser.close();
  }
}

async function visible(locator) {
  const count = await locator.count();
  for (let index = 0; index < count; index += 1) {
    const item = locator.nth(index);
    if (await item.isVisible()) return item;
  }
  throw new Error(`No visible element for ${locator}`);
}

(async () => {
  const desktop = { width: 1440, height: 1000 };
  const mobile = { width: 390, height: 844 };

  await withPage('desktop header controllers', desktop, async page => {
    const searchTrigger = await visible(page.locator('[data-v2-search-open]'));
    await searchTrigger.click();
    const searchRoot = page.locator('[data-v2-search]');
    const searchConsole = searchRoot.locator('.sd2-v2-search-console');
    if (!(await searchConsole.evaluate(el => el.classList.contains('is-open')))) throw new Error('Search did not open');
    const searchInput = await visible(searchRoot.locator('[data-v2-search-input]'));
    await page.waitForTimeout(250);
    if (!(await searchInput.evaluate(el => el === document.activeElement))) throw new Error('Search input did not receive focus');
    await page.keyboard.press('Escape');
    if (await searchConsole.evaluate(el => el.classList.contains('is-open'))) throw new Error('Search did not close with Escape');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const garageTrigger = await visible(page.locator('[data-v2-garage-toggle]'));
    await garageTrigger.click();
    const garage = page.locator('.sd2-v2-garage-panel');
    if (!(await garage.evaluate(el => el.classList.contains('is-open')))) throw new Error('Garage did not open');
    await page.keyboard.press('Escape');
    if (await garage.evaluate(el => el.classList.contains('is-open'))) throw new Error('Garage did not close with Escape');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const cartTrigger = await visible(page.locator('[data-v2-cart-open]'));
    await cartTrigger.click();
    const cart = page.locator('.sd2-v2-cart-panel');
    if (!(await cart.evaluate(el => el.classList.contains('is-open')))) throw new Error('Cart did not open');
    await page.keyboard.press('Escape');
    if (await cart.evaluate(el => el.classList.contains('is-open'))) throw new Error('Cart did not close with Escape');
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(500);

    const megaTrigger = await visible(page.locator('[data-v2-menu-trigger]'));
    await megaTrigger.hover();
    await page.waitForTimeout(200);
    const expanded = await megaTrigger.getAttribute('aria-expanded');
    if (expanded !== 'true') throw new Error(`Mega menu did not expand: ${expanded}`);
    await page.keyboard.press('Escape');
  });

  await withPage('desktop homepage platform selector', desktop, async page => {
    const tabs = page.locator('[data-v5-truck-select]');
    const panels = page.locator('[data-v5-truck]');
    if (await tabs.count() !== 3 || await panels.count() !== 3) throw new Error('Expected three platform tabs and panels');
    for (let index = 0; index < 3; index += 1) {
      await tabs.nth(index).click();
      await page.waitForTimeout(250);
      if (await tabs.nth(index).getAttribute('aria-selected') !== 'true') throw new Error(`Platform tab ${index + 1} not selected`);
      if (!(await panels.nth(index).isVisible())) throw new Error(`Platform panel ${index + 1} not visible`);
      const enter = panels.nth(index).getByRole('link', { name: /enter/i });
      if (!(await enter.isVisible()) || !(await enter.getAttribute('href'))) throw new Error(`Platform CTA ${index + 1} missing or unlinked`);
    }
  });

  await withPage('desktop PDP controls and dossier', desktop, async page => {
    await page.goto(PDP, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(800);
    const navLinks = page.locator('.sd2-v3-product-jumpnav a');
    if (await navLinks.count() < 5) throw new Error('Product dossier navigation incomplete');
    for (let index = 0; index < await navLinks.count(); index += 1) {
      const href = await navLinks.nth(index).getAttribute('href');
      const hash = href && new URL(href, page.url()).hash;
      if (!hash || !(await page.locator(hash).count())) throw new Error(`Missing PDP target for ${href}`);
    }
    await navLinks.getByText('FAQ', { exact: true }).click();
    await page.waitForTimeout(300);
    const faqTriggers = page.locator('#faq [data-v2-accordion-trigger]');
    if (await faqTriggers.count() !== 3) throw new Error('Expected three FAQ controls');
    await faqTriggers.nth(1).click();
    if (await faqTriggers.nth(1).getAttribute('aria-expanded') !== 'true') throw new Error('FAQ did not expand');

    const input = await visible(page.locator('[data-v2-qty-input]'));
    const initial = Number(await input.inputValue());
    await (await visible(page.locator('[data-v2-qty-plus]'))).click();
    if (new URL(page.url()).pathname !== new URL(PDP).pathname) throw new Error(`PDP quantity changed route to ${page.url()}`);
    if (Number(await input.inputValue()) !== initial + 1) throw new Error('PDP quantity plus failed');
    await (await visible(page.locator('[data-v2-qty-minus]'))).click();
    if (Number(await input.inputValue()) !== initial) throw new Error('PDP quantity minus failed');
  });

  await withPage('desktop category controls', desktop, async page => {
    await page.goto(CATEGORY, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(800);
    const categorySelects = page.locator('.sd2-v2-toolbar select');
    if (await categorySelects.count() < 4) throw new Error(`Expected four category controls, found ${await categorySelects.count()}`);
    for (let index = 0; index < 4; index += 1) {
      const control = categorySelects.nth(index);
      if (!(await control.isVisible()) || !(await control.isEnabled())) throw new Error(`Category control ${index + 1} unavailable`);
    }
    const cards = page.locator('.sd2-v2-product-card');
    if (!(await cards.count())) throw new Error('No product cards rendered');
  });

  await withPage('mobile navigation and PDP controls', mobile, async page => {
    const account = await visible(page.locator('.sd2-v2-hdr__account-link'));
    const accountBox = await account.boundingBox();
    if (!accountBox || accountBox.width < 44 || accountBox.height < 44) throw new Error(`Mobile account target is ${accountBox && accountBox.width}x${accountBox && accountBox.height}`);
    const mobileToggle = await visible(page.locator('[data-v2-drawer-open]'));
    await mobileToggle.click();
    const mobilePanel = page.locator('[data-v2-drawer]');
    if (await mobilePanel.getAttribute('aria-hidden') !== 'false') throw new Error('Mobile navigation did not open');
    await page.keyboard.press('Escape');
    if (await mobilePanel.getAttribute('aria-hidden') !== 'true') throw new Error('Mobile navigation did not close');

    await page.goto(PDP, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(800);
    const faqLink = page.locator('.sd2-v3-product-jumpnav a').getByText('FAQ', { exact: true });
    await faqLink.click();
    const faqTriggers = page.locator('#faq [data-v2-accordion-trigger]');
    if (await faqTriggers.count() !== 3) throw new Error('Mobile FAQ controls missing');
    await faqTriggers.nth(2).click();
    if (await faqTriggers.nth(2).getAttribute('aria-expanded') !== 'true') throw new Error('Mobile FAQ did not expand');
    const width = await page.evaluate(() => ({ doc: document.documentElement.scrollWidth, viewport: innerWidth }));
    if (width.doc > width.viewport + 1) throw new Error(`Mobile overflow ${width.doc}/${width.viewport}`);
  });

  console.log(JSON.stringify(results, null, 2));
  process.exitCode = results.some(result => !result.pass) ? 1 : 0;
})();
