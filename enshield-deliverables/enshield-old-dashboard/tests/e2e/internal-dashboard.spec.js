import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const screenshotDir = path.join(os.tmpdir(), "enshield-qa-screenshots");
const permissions = [
  "view_dashboard", "view_clients", "view_orders", "view_claims",
  "view_audit", "view_reports", "export_reports", "manage_settings",
  "view_users", "manage_storefront_configuration",
];
const identity = {
  success: true,
  roleKey: "Administrator",
  permissions,
  user: { name: "QA Administrator", email: "qa@enshield.test" },
  clients: [
    { shopId: "shop-1", name: "Rudy's Performance Parts", permissions },
    { shopId: "shop-2", name: "South Central Diesel", permissions },
  ],
};

const activity = Array.from({ length: 12 }, (_, month) => ({
  month,
  orders: month === 0 ? 5 : 0,
  value: month === 0 ? 1327.13 : 0,
}));
const metrics = {
  success: true,
  generatedAt: "2026-07-23T19:00:00.000Z",
  scope: "assigned-shops",
  currency: "USD",
  shop: { name: "All assigned clients" },
  activity,
  metrics: {
    protectedOrders: 13, totalOrders: 13, valueInTransit: 1327.13,
    openClaims: 1, openClaimsAvailable: true, status: "active", insuranceRate: 0.02,
  },
  insuranceMetrics: { revenue: 26.54, attachRate: 100, protectedOrders: 13 },
  refundsReturns: { refundedAmount: 0, refundedOrders: 0, refundRate: 0, returnRate: 0, returnedOrders: 0 },
  revenueTrend: { revenue: 1327.13, aov: 102.09, orders: 13 },
  fulfillmentHealth: { fulfillmentRate: 92.3, fulfilledOrders: 12, inTransitOrders: 1, cancelRate: 0, cancelledOrders: 0 },
  latestOrders: [{ id: "o1", name: "#1013", value: 644.14, protected: true, fulfillmentStatus: "fulfilled", createdAt: "2026-07-15T12:00:00Z" }],
};

const lists = {
  clients: [{ id: "c1", storeName: "Rudy's Performance Parts", storeId: "ENS26-M-0604", plan: "Growth", status: "active", claimCount: 1, valueInTransitMinor: 49622146, valueInTransitCurrency: "USD", createdAt: "2026-06-04T00:00:00Z" }],
  orders: [{ id: "o1", name: "#1013", value: 644.14, currency: "USD", protected: true, financialStatus: "paid", fulfillmentStatus: "fulfilled", createdAt: "2026-07-15T00:00:00Z", shop: { name: "Rudy's Performance Parts" } }],
  claims: [{ id: "cl1", reason: "Damaged", status: "Closed", claimValueMinor: 58798, claimCurrency: "USD", orderValueMinor: 64414, orderCurrency: "USD", createdAt: "2026-07-15T00:00:00Z", order: { name: "#1013" }, client: { storeName: "Rudy's Performance Parts" } }],
  errors: [],
  users: [{ id: "u1", name: "Rizwan Khalid", email: "r.khalid@enshield.test", role: { name: "Administrator" }, status: "active", lastLoginAt: "2026-07-23T18:00:00Z", createdAt: "2026-01-01T00:00:00Z" }],
};

async function installMocks(page) {
  await page.addInitScript(() => {
    window.gadgetConfig = {
      environment: "development",
      apiKeys: { shopify: "test-shopify-key" },
    };
  });
  await page.route("**/api/me", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(identity) }));
  await page.route("**/api/performance/collect", (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("**/api/dashboard-metrics**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(metrics) }));
  for (const [name, rows] of Object.entries(lists)) {
    await page.route(`**/api/${name}**`, (route) => route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true, [name]: rows, pageInfo: { hasNextPage: false, endCursor: null } }),
    }));
  }
}

async function expectViewportContained(page) {
  const viewport = page.viewportSize();
  const bounds = await page.locator(".esd-root").evaluate((element) => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
    rootRight: element.getBoundingClientRect().right,
  }));
  expect(bounds.scrollWidth).toBeLessThanOrEqual(bounds.clientWidth);
  expect(bounds.rootRight).toBeLessThanOrEqual(viewport.width);
  const headerBoxes = await page.locator(
    ".esd-shell-header button, .esd-shell-header select, .esd-shell-header .esd-account"
  ).evaluateAll((elements) => elements.filter((element) => {
    const style = getComputedStyle(element);
    return style.display !== "none" && style.visibility !== "hidden";
  }).map((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right };
  }));
  for (const box of headerBoxes) {
    expect(box.left).toBeGreaterThanOrEqual(0);
    expect(box.right).toBeLessThanOrEqual(viewport.width);
  }
  const overflowing = await page.locator(".esd-root *").evaluateAll((elements, width) =>
    elements.flatMap((element) => {
      const style = getComputedStyle(element);
      if (
        style.display === "none" ||
        style.visibility === "hidden" ||
        element.classList.contains("esd-visually-hidden")
      ) return [];
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0 || (rect.left >= -0.5 && rect.right <= width + 0.5)) return [];
      return [{
        tag: element.tagName,
        className: element.className,
        left: rect.left,
        right: rect.right,
        width: rect.width,
      }];
    }), viewport.width
  );
  expect(overflowing).toEqual([]);
}

test.beforeEach(async ({ page }) => {
  fs.mkdirSync(screenshotDir, { recursive: true });
  await installMocks(page);
});

test("mocked internal login starts and callback completes", async ({ page }) => {
  await page.route("**/auth/internal-start", (route) => route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({ success: true, authorizationUrl: `${page.context()._options.baseURL}/internal-auth/callback#token=e2e-token` }),
  }));
  await page.route("**/auth/internal-callback", (route) => route.fulfill({
    status: 200, contentType: "application/json", body: JSON.stringify({ success: true }),
  }));
  await page.goto("/internal-login");
  await expect(page).toHaveTitle(/Enshield/i);
  await page.getByRole("button", { name: "Continue to secure sign-in" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("authenticated operational pages work without console or accessibility errors", async ({ page }, testInfo) => {
  const runtimeErrors = [];
  const failedAppResponses = [];
  page.on("console", (message) => {
    if (message.type() === "error") runtimeErrors.push(message.text());
  });
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  page.on("response", (response) => {
    if (response.status() >= 400 && new URL(response.url()).origin === "http://127.0.0.1:4174") {
      failedAppResponses.push(`${response.status()} ${response.url()}`);
    }
  });

  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/dashboard");
  await expect(page).toHaveTitle(/Enshield/i);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  await expect(page.locator("main")).not.toBeEmpty();
  await expect(page.locator("vite-error-overlay")).toHaveCount(0);
  await expectViewportContained(page);
  await expect(page.getByText("PROTECTED ORDERS", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "All time" }).click();
  await expect(page.getByRole("button", { name: "All time" })).toHaveAttribute("aria-pressed", "true");
  const yearBefore = Number(await page.locator(".esd-year span").textContent());
  await page.getByRole("button", { name: "Previous year" }).click();
  await expect(page.locator(".esd-year span")).toHaveText(String(yearBefore - 1));
  const suffix = testInfo.project.name.includes("mobile") ? "mobile" : "desktop";
  await page.screenshot({ path: path.join(screenshotDir, `enshield-dashboard-${suffix}.png`), fullPage: true });

  for (const [pathName, visibleText] of [
    ["clients", "Rudy's Performance Parts"],
    ["orders", "#1013"],
    ["claims", "Damaged"],
    ["errors", "No integration errors match this view."],
    ["reports", "Export CSV"],
    ["settings", "Protection overview"],
    ["users", "Rizwan Khalid"],
  ]) {
    await page.goto(`/${pathName}`);
    await expect(page.getByRole("heading", { name: new RegExp(pathName, "i") })).toBeVisible();
    await expect(page.locator("main").getByText(visibleText, { exact: false }).first()).toBeVisible();
    await expectViewportContained(page);
    const pageAxe = await new AxeBuilder({ page }).analyze();
    expect(pageAxe.violations).toEqual([]);
  }

  await page.goto("/clients");
  const search = page.getByRole("searchbox");
  await search.fill("Rudy");
  await expect(search).toHaveValue("Rudy");
  await page.getByRole("combobox", { name: "Client context" }).selectOption("shop-2");

  const notificationButton = page.getByRole("button", { name: "Notifications" });
  await notificationButton.click();
  await expect(page.getByRole("region", { name: "Notifications panel" })).toBeFocused();
  await page.getByRole("button", { name: "Close", exact: true }).click();
  await expect(notificationButton).toBeFocused();
  await notificationButton.click();
  await page.locator("main").click({ position: { x: 5, y: 5 } });
  await expect(page.getByRole("region", { name: "Notifications panel" })).toHaveCount(0);

  if (testInfo.project.name.includes("mobile")) {
    const menu = page.getByRole("button", { name: "Open navigation" });
    await menu.click();
    await expect(page.getByRole("dialog", { name: "Navigation menu" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(menu).toBeFocused();
    await menu.click();
    await page.getByRole("link", { name: "Claims" }).click();
    await expect(page).toHaveURL(/\/claims$/);
  }

  await page.goto("/reports");
  const yearInput = page.getByRole("spinbutton", { name: "Year" });
  await yearInput.fill("2025");
  await expect(yearInput).toHaveValue("2025");
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  expect((await downloadPromise).suggestedFilename()).toContain("2025");
  await page.goto("/dashboard");
  const transitionDuration = await page.locator(".esd-sidebar").evaluate(
    (element) => getComputedStyle(element).transitionDuration
  );
  expect(Number.parseFloat(transitionDuration)).toBeLessThanOrEqual(0.001);
  const dashboardMotionDurations = await page.locator(
    ".esd-metricgroups > *, .esd-chartcard, .esd-bar, .esd-stat"
  ).evaluateAll((elements) => elements.map((element) => {
    const style = getComputedStyle(element);
    return {
      animation: Number.parseFloat(style.animationDuration) || 0,
      transitions: style.transitionDuration.split(",").map(
        (value) => Number.parseFloat(value) || 0
      ),
    };
  }));
  expect(dashboardMotionDurations.length).toBeGreaterThan(0);
  for (const duration of dashboardMotionDurations) {
    expect(duration.animation).toBeLessThanOrEqual(0.001);
    expect(Math.max(...duration.transitions)).toBeLessThanOrEqual(0.001);
  }

  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  expect(failedAppResponses).toEqual([]);
  expect(runtimeErrors).toEqual([]);
  await page.goto("/clients");
  await page.screenshot({ path: path.join(screenshotDir, `enshield-table-${suffix}.png`), fullPage: true });
});

test("loading, error retry, forbidden, empty, pagination, and sign-out states", async ({ page }) => {
  let clientAttempts = 0;
  await page.route("**/api/clients**", async (route) => {
    clientAttempts += 1;
    if (clientAttempts <= 2) {
      await new Promise((resolve) => setTimeout(resolve, 150));
      return route.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ success: false, error: "temporary" }) });
    }
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, clients: lists.clients, pageInfo: { hasNextPage: false, endCursor: null } }) });
  });
  await page.goto("/clients");
  await expect(page.getByRole("status")).toContainText("Loading clients");
  await expect(page.getByRole("status")).toContainText("Couldn’t load clients");
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator("main").getByText("Rudy's Performance Parts")).toBeVisible();
  expect((await new AxeBuilder({ page }).analyze()).violations).toEqual([]);

  await page.route("**/api/claims**", (route) => route.fulfill({ status: 403, contentType: "application/json", body: JSON.stringify({ success: false, error: "forbidden" }) }));
  await page.goto("/claims");
  await expect(page.getByRole("status")).toContainText("permission to view claims");

  await page.goto("/errors");
  await expect(page.getByRole("status")).toContainText("No integration errors");

  await page.route("**/api/orders**", (route) => {
    const after = new URL(route.request().url()).searchParams.get("after");
    const rows = after ? [{ ...lists.orders[0], id: "o2", name: "#1014" }] : lists.orders;
    return route.fulfill({
      status: 200, contentType: "application/json",
      body: JSON.stringify({ success: true, orders: rows, pageInfo: { hasNextPage: !after, endCursor: after ? null : "cursor-2" } }),
    });
  });
  await page.goto("/orders");
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page.getByText("#1014")).toBeVisible();
  await page.getByRole("button", { name: "Previous page" }).click();
  await expect(page.getByText("#1013")).toBeVisible();

  let releaseLogout;
  await page.route("**/auth/internal-logout", async (route) => {
    await new Promise((resolve) => { releaseLogout = resolve; });
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ success: true }),
    });
  });
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("button", { name: "Signing out…" })).toBeDisabled();
  releaseLogout();
  await expect(page).toHaveURL(/\/internal-login$/);
});
