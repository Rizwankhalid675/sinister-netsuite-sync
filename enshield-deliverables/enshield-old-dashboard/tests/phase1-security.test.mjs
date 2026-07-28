import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const source = (relativePath) =>
  readFileSync(new URL(`../${relativePath}`, import.meta.url), "utf8");

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const allJavaScriptFiles = (directory) =>
  readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    return entry.isDirectory()
      ? allJavaScriptFiles(absolute)
      : entry.name.endsWith(".js") ? [absolute] : [];
  });

const loggerObjectArguments = (text) =>
  [...text.matchAll(/logger\.(?:info|warn|error|debug)\s*\(\s*(\{[\s\S]*?\})\s*,/g)]
    .map((match) => match[1]);

test("identity resolution uses verified operator identity and explicit shop assignments", () => {
  const me = source("api/routes/api/GET-me.js");
  const access = source("api/lib/internalAccess.js");
  const callback = source("api/routes/auth/POST-internal-callback.js");
  assert.match(me, /resolveInternalOperator/);
  assert.match(access, /session\?\.get\("personId"\)/);
  assert.match(access, /api\.internalOperator\.findFirst/);
  assert.match(access, /api\.operatorShopAssignment\.findMany/);
  assert.match(access, /status:\s*\{\s*equals:\s*"active"/);
  assert.match(callback, /verifyTrustedAuthToken/);
  assert.ok(callback.indexOf("verifyTrustedAuthToken") < callback.indexOf('session.set("personId"'));
  assert.doesNotMatch(me, /roleKey\s*=\s*"Super Admin"/);
  assert.match(me, /permissions:\s*\[\]/);
});

test("session-scoped read routes enforce their backend view permissions", () => {
  // GET-users.js is intentionally shop-scoped self-service data (appUser),
  // not an internal-access-gated resource, so it uses requirePermission
  // instead of requireInternalAccess. See its own module comment.
  const internalAccessExpectations = {
    "api/routes/api/GET-dashboard-metrics.js": "VIEW_DASHBOARD",
    "api/routes/api/GET-clients.js": "VIEW_CLIENTS",
    "api/routes/api/GET-claims.js": "VIEW_CLAIMS",
  };

  for (const [file, permission] of Object.entries(internalAccessExpectations)) {
    const route = source(file);
    assert.match(route, /requireInternalAccess/);
    assert.match(route, new RegExp(`PERMISSIONS\\.${permission}`));
  }

  const usersRoute = source("api/routes/api/GET-users.js");
  assert.match(usersRoute, /requirePermission/);
  assert.match(usersRoute, /PERMISSIONS\.VIEW_USERS/);
});

test("admin model mutations enforce fine-grained permissions before save", () => {
  const expectations = {
    "api/models/appUser/actions/create.js": "MANAGE_USERS",
    "api/models/appUser/actions/update.js": "MANAGE_USERS",
    "api/models/appUser/actions/delete.js": "MANAGE_USERS",
    "api/models/client/actions/create.js": "EDIT_CLIENTS",
    "api/models/client/actions/update.js": "EDIT_CLIENTS",
    "api/models/claim/actions/create.js": "EDIT_CLAIMS",
    "api/models/claim/actions/update.js": "EDIT_CLAIMS",
    "api/models/appRole/actions/update.js": "MANAGE_SETTINGS",
  };

  for (const [file, permission] of Object.entries(expectations)) {
    const action = source(file);
    assert.match(action, /requirePermission/);
    assert.match(action, new RegExp(`PERMISSIONS\\.${permission}`));
    const persistenceIndex = action.includes("await save(record)")
      ? action.indexOf("await save(record)")
      : action.indexOf("await persistClaimMutation");
    assert.ok(
      action.indexOf("requirePermission") < persistenceIndex,
      `${file} must authorize before saving`
    );
  }
});

test("unauthenticated role cannot invoke Shopify product setup", () => {
  const access = source("accessControl/permissions.gadget.ts");
  // Scope the match to just the `unauthenticated` role block (up to its
  // closing brace before the next top-level role key) rather than letting
  // [\s\S]* run unbounded into later roles like "shopify-app-users".
  const blockMatch = access.match(/unauthenticated:\s*\{[\s\S]*?\n\s{4}\},\n/);
  assert.ok(blockMatch, "expected to find the unauthenticated role block");
  assert.doesNotMatch(blockMatch[0], /setupInsuranceProduct:\s*true/);
});

test("global role updates write their audit record in the acting shop scope", () => {
  const action = source("api/models/appRole/actions/update.js");
  assert.match(action, /session\?\.get\("shopId"\)/);
  assert.doesNotMatch(action, /shopId:\s*null/);
});

test("declared production build command is cross-platform", () => {
  const pkg = JSON.parse(source("package.json"));
  assert.equal(pkg.scripts.build, "vite build");
});

test("storefront configuration routes do not log domains, URLs, raw errors, or Shopify payloads", () => {
  for (const relativePath of [
    "api/routes/api/GET-get-metafields.js",
    "api/routes/api/POST-update-metafield.js",
  ]) {
    const route = source(relativePath);
    assert.doesNotMatch(
      route,
      /logger\.(?:info|warn|error|debug)\s*\(\s*\{[^}]*?(?:\bdomain\b|learnMoreUrl|desktopImageUrl|mobileImageUrl|shopGid|userErrors|\berror\s*[,}]|\bstack\b|\bresponse\b)/s
    );
  }
});

test("API logger metadata never includes raw errors, requests, responses, tenant domains, tracking, products, variants, or prices", () => {
  const forbiddenMetadata = /(?:^|[,{]\s*)(?:error|errors|params|body|request|response|userErrors|domain|shopDomain|tracking(?:Number|Value)?|product(?:Id|Gid)?|variant(?:Id|Gid|Input)?|price|pricingVersion|amountMinor|insuranceCost)\s*(?=[:,}])/m;
  const failures = [];

  for (const file of allJavaScriptFiles(path.join(projectRoot, "api"))) {
    const text = readFileSync(file, "utf8");
    for (const metadata of loggerObjectArguments(text)) {
      if (forbiddenMetadata.test(metadata)) {
        failures.push(path.relative(projectRoot, file));
        break;
      }
    }
  }

  assert.deepEqual(failures, []);
});

test("reviewed setup and dashboard modules log only allowlisted metadata", () => {
  for (const relativePath of [
    "api/actions/setupInsuranceProduct.js",
    "api/actions/setupShippingInsuranceProduct.js",
    "api/routes/api/GET-shop-info.js",
    "api/routes/api/GET-dashboard-metrics.js",
  ]) {
    for (const metadata of loggerObjectArguments(source(relativePath))) {
      const keys = [...metadata.matchAll(/(?:^|[,{]\s*)([A-Za-z][A-Za-z0-9]*)\s*:/gm)]
        .map((match) => match[1]);
      assert.deepEqual(
        keys.filter((key) => !["event", "errorName", "statusCode", "correlationHash"].includes(key)),
        [],
        `${relativePath} contains non-allowlisted logger metadata`
      );
      assert.doesNotMatch(metadata, /\{\s*error\s*[},]/);
    }
  }
});
