import { chromium } from "playwright";
import { spawnSync } from "node:child_process";
import { EnshieldShippingProtectionClient } from "@gadget-client/enshield-shipping-protection";
import { upsertLegacyBatch } from "../api/lib/legacyImport.js";
import {
  normalizeClaim,
  normalizeClient,
  normalizeOrder,
} from "./lib/normalizeNovaExport.js";

const MAX_PAGES = 1000;
const PAGE_CONCURRENCY = 3;
const FETCH_TIMEOUT_MS = 20_000;
const BATCH_SIZE = 100;
const apply = process.argv.includes("--apply");
const productionCdp = process.env.ENSHIELD_PRODUCTION_CDP || "http://127.0.0.1:9333";
const developmentUrl = process.env.ENSHIELD_DEVELOPMENT_URL ||
  "https://enshield-shipping-protection--development.gadget.app";

async function fetchNovaJson(cookieHeader, path) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      const response = await fetch(new URL(path, "https://manage.enshield.com"), {
        method: "GET",
        redirect: "error",
        headers: { Accept: "application/json", Cookie: cookieHeader },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`Nova GET failed with ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError;
}

async function readNovaResources(cookieHeader, resource) {
  const firstPayload = await fetchNovaJson(cookieHeader, `/nova-api/${resource}?perPage=100&page=1`);
  const records = [...(firstPayload.resources || [])];
  const perPage = Math.max(1, Number(firstPayload.per_page) || records.length || 1);
  const totalPages = Math.ceil((Number(firstPayload.total) || records.length) / perPage);
  if (totalPages > MAX_PAGES) throw new Error(`${resource} exceeded the ${MAX_PAGES}-page safety limit`);
  for (let start = 2; start <= totalPages; start += PAGE_CONCURRENCY) {
    const pageNumbers = Array.from(
      { length: Math.min(PAGE_CONCURRENCY, totalPages - start + 1) },
      (_, index) => start + index
    );
    const payloads = await Promise.all(pageNumbers.map((number) =>
      fetchNovaJson(cookieHeader, `/nova-api/${resource}?perPage=${perPage}&page=${number}`)
    ));
    for (const payload of payloads) records.push(...(payload.resources || []));
  }
  return records;
}

function resourceId(resource) {
  const value = resource?.id?.value ?? resource?.id;
  if (value == null) throw new Error("Nova resource is missing its ID");
  return String(value);
}

async function readProduction(page, cookieHeader) {
  if (new URL(page.url()).pathname === "/login") {
    throw new Error("Production Nova session is not authenticated");
  }

  const clientIndex = await readNovaResources(cookieHeader, "clients");
  console.error(`Read ${clientIndex.length} Nova clients`);
  const clients = [];
  for (const indexResource of clientIndex) {
    const id = resourceId(indexResource);
    const detail = await fetchNovaJson(cookieHeader, `/nova-api/clients/${id}`);
    clients.push(normalizeClient({ id, fields: detail.resource?.fields || detail.fields || [] }));
  }
  const platformByClient = new Map(clients.map((client) => [client.legacyId, client.platform]));

  const orderResources = await readNovaResources(cookieHeader, "orders");
  console.error(`Read ${orderResources.length} Nova orders`);
  const orders = orderResources.map((resource) => normalizeOrder({
    id: resourceId(resource),
    fields: resource.fields || [],
  }, platformByClient));

  const claimResources = await readNovaResources(cookieHeader, "claims");
  console.error(`Read ${claimResources.length} Nova claims`);
  const claims = claimResources.map((resource) => normalizeClaim({
    id: resourceId(resource),
    fields: resource.fields || [],
  }, platformByClient));

  return { clients, orders, claims };
}

async function loginToDevelopment() {
  const developmentCdp = process.env.ENSHIELD_DEV_CDP || "http://127.0.0.1:9222";
  try {
    const browser = await chromium.connectOverCDP(developmentCdp);
    const page = browser.contexts().flatMap((context) => context.pages())
      .find((candidate) => candidate.url().startsWith(developmentUrl));
    if (page) {
      const authenticated = await page.evaluate(async () => (await fetch("/api/me", { credentials: "include" })).ok);
      if (authenticated) return { browser, page };
    }
    await browser.close();
  } catch {
    // Fall back to an isolated credential login when no authenticated CDP tab exists.
  }
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`${developmentUrl}/internal-login`, { waitUntil: "networkidle", timeout: 60000 });
  const devBypass = await page.evaluate(async () => {
    const response = await fetch("/auth/internal-start", { credentials: "include" });
    const body = response.ok ? await response.json() : null;
    return body ? { ...body, authorization: response.headers.get("x-set-authorization") } : null;
  });
  if (devBypass?.authorizationUrl) {
    await page.goto(new URL(devBypass.authorizationUrl, developmentUrl).toString(), { waitUntil: "networkidle" });
    return { browser, page, authorization: devBypass.authorization };
  }
  const email = process.env.ENSHIELD_DEV_EMAIL;
  const password = process.env.ENSHIELD_DEV_PASSWORD;
  if (!email || !password) {
    throw new Error("--apply requires development credentials when the dev operator bypass is unavailable");
  }
  const emailInput = page.locator('input[type="email"]');
  if (await emailInput.isVisible().catch(() => false)) {
    await emailInput.fill(email);
    await page.locator('input[type="password"]').fill(password);
    // Gadget's development harness is an overlay and can intercept synthetic
    // pointer events even though the underlying form is ready.
    await page.getByRole("button", { name: /sign in/i }).click({ force: true });
    await page.waitForURL(/\/dashboard/, { timeout: 60000 });
  }
  return { browser, page };
}

async function postBatch(page, resource, records, authorization) {
  return page.evaluate(async ({ resource, records, authorization }) => {
    const response = await fetch("/api/import-legacy-production", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json", Accept: "application/json", ...(authorization ? { Authorization: authorization } : {}) },
      body: JSON.stringify({ resource, records }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `Development import failed with ${response.status}`);
    return payload;
  }, { resource, records, authorization });
}

async function importResource(page, resource, records, authorization) {
  const totals = { created: 0, updated: 0, unchanged: 0, rejected: 0 };
  for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
    const result = await postBatch(page, resource, records.slice(offset, offset + BATCH_SIZE), authorization);
    for (const key of Object.keys(totals)) totals[key] += Number(result[key] || 0);
  }
  return totals;
}

async function importResourceWithApi(api, resource, records) {
  const totals = { created: 0, updated: 0, unchanged: 0, rejected: 0 };
  for (let offset = 0; offset < records.length; offset += BATCH_SIZE) {
    const result = await upsertLegacyBatch(api, resource, records.slice(offset, offset + BATCH_SIZE));
    for (const key of Object.keys(totals)) totals[key] += Number(result[key] || 0);
  }
  return totals;
}

function ggtBulkCreate(model, inputs) {
  if (!inputs.length) return;
  const encoded = Buffer.from(JSON.stringify(inputs)).toString("base64");
  const code = `const rows=JSON.parse(Buffer.from("${encoded}","base64").toString("utf8")); await api.internal.${model}.bulkCreate(rows); return {created:rows.length}`;
  const command = process.platform === "win32" ? "powershell.exe" : "ggt";
  const args = process.platform === "win32"
    ? ["-NoProfile", "-File", `${process.env.APPDATA}\\npm\\ggt.ps1`, "eval", "--env", "development", "--json", code]
    : ["eval", "--env", "development", "--json", code];
  const run = spawnSync(command, args, {
    cwd: process.cwd(), encoding: "utf8", timeout: 120_000,
  });
  if (run.status !== 0) throw new Error(run.error?.message || run.stderr || run.stdout || `ggt bulk create failed for ${model} (status=${run.status}, signal=${run.signal})`);
}

async function importWithGgt(api, data) {
  const totals = {
    clients: { created: 0, updated: 0, unchanged: 0, rejected: 0 },
    orders: { created: 0, updated: 0, unchanged: 0, rejected: 0 },
    claims: { created: 0, updated: 0, unchanged: 0, rejected: 0 },
  };
  const existingClients = await api.client.findMany({ first: 100, select: { id: true, legacySourceKey: true } });
  const clientByKey = new Map(existingClients.map((client) => [client.legacySourceKey, client]));
  const missingClients = data.clients.filter((record) => !clientByKey.has(record.sourceKey)).map((record) => ({
    legacySourceKey: record.sourceKey, legacyStoreId: record.legacyId, storeId: record.storeId,
    storeName: record.storeName, platform: record.platform, apiEnabled: record.apiEnabled,
    customerSince: record.customerSince || undefined, status: record.status,
  }));
  ggtBulkCreate("client", missingClients);
  totals.clients.created = missingClients.length;
  totals.clients.unchanged = data.clients.length - missingClients.length;
  const refreshedClients = await api.client.findMany({ first: 100, select: { id: true, legacySourceKey: true } });
  const refreshedClientByKey = new Map(refreshedClients.map((client) => [client.legacySourceKey, client]));

  for (let offset = 0; offset < data.orders.length; offset += 50) {
    const batch = data.orders.slice(offset, offset + 50);
    const existing = await api.legacyOrder.findMany({ first: 50, filter: { sourceKey: { in: batch.map((record) => record.sourceKey) } }, select: { sourceKey: true } });
    const keys = new Set(existing.map((record) => record.sourceKey));
    const creates = batch.filter((record) => !keys.has(record.sourceKey)).map((record) => ({
      sourceKey: record.sourceKey, legacyId: record.legacyId, platform: record.platform,
      orderNumber: record.orderNumber, valueMinor: record.valueMinor,
      protectionCostMinor: record.protectionCostMinor, taxMinor: record.taxMinor,
      shippingMinor: record.shippingMinor, currency: record.currency, status: record.status,
      isShipped: record.isShipped === true, trackingNumber: record.trackingNumber || undefined,
      placedAt: record.placedAt || undefined,
      client: { _link: refreshedClientByKey.get(`nova:client:${record.legacyClientId}`).id },
    }));
    ggtBulkCreate("legacyOrder", creates);
    totals.orders.created += creates.length;
    totals.orders.unchanged += batch.length - creates.length;
  }

  for (const record of data.claims) {
    const existing = await api.legacyClaim.maybeFindFirst({ filter: { sourceKey: { equals: record.sourceKey } }, select: { id: true } });
    if (existing) { totals.claims.unchanged += 1; continue; }
    const order = record.legacyOrderId ? await api.legacyOrder.maybeFindFirst({ filter: { sourceKey: { equals: `nova:order:${record.legacyOrderId}` } }, select: { id: true } }) : null;
    ggtBulkCreate("legacyClaim", [{
      sourceKey: record.sourceKey, legacyId: record.legacyId, platform: record.platform,
      claimValueMinor: record.claimValueMinor, currency: record.currency, status: record.status,
      submittedAt: record.submittedAt || undefined,
      client: { _link: refreshedClientByKey.get(`nova:client:${record.legacyClientId}`).id },
      ...(order ? { legacyOrder: { _link: order.id } } : {}),
    }]);
    totals.claims.created += 1;
  }
  return totals;
}

async function main() {
  const productionBrowser = await chromium.connectOverCDP(productionCdp);
  const productionPage = productionBrowser.contexts()
    .flatMap((context) => context.pages())
    .find((page) => page.url().includes("manage.enshield.com"));
  if (!productionPage) throw new Error("Authenticated production Nova tab was not found");

  const productionCookies = await productionBrowser.contexts()[0].cookies("https://manage.enshield.com");
  const cookieHeader = productionCookies.map(({ name, value }) => `${name}=${value}`).join("; ");
  const data = await readProduction(productionPage, cookieHeader);
  const platforms = Object.fromEntries(
    data.clients.map((client) => [client.platform, data.orders.filter((order) => order.legacyClientId === client.legacyId).length])
  );
  const summary = {
    dryRun: !apply,
    clients: data.clients.length,
    orders: data.orders.length,
    claims: data.claims.length,
    ordersByPlatform: platforms,
  };

  if (!apply) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  const developmentApiKey = process.env.GADGET_API_KEY;
  if (developmentApiKey) {
    const api = new EnshieldShippingProtectionClient({
      environment: "development",
      authenticationMode: { apiKey: developmentApiKey },
    });
    summary.import = await importWithGgt(api, data);
  } else {
    const development = await loginToDevelopment();
    try {
      summary.import = {
        clients: await importResource(development.page, "clients", data.clients, development.authorization),
        orders: await importResource(development.page, "orders", data.orders, development.authorization),
        claims: await importResource(development.page, "claims", data.claims, development.authorization),
      };
    } finally {
      await development.browser.close();
    }
  }
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
