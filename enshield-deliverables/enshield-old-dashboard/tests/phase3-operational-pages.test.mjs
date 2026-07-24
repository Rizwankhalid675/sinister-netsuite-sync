import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  buildListUrl,
  csvCell,
  toCsv,
  createPageState,
  changePageQuery,
  nextPageState,
  previousPageState,
} from "../web/lib/operationalData.js";
import {
  parsePageSize,
  parseSearch,
  parseEnumFilter,
  pageInfoFor,
} from "../api/lib/listQuery.js";

const appSource = readFileSync(
  new URL("../web/components/App.jsx", import.meta.url),
  "utf8"
);

test("list URLs preserve cursor and encode filters without empty parameters", () => {
  assert.equal(
    buildListUrl("/api/orders", {
      after: "cursor+/=",
      first: 25,
      search: "Order #1001",
      status: "",
    }),
    "/api/orders?after=cursor%2B%2F%3D&first=25&search=Order+%231001"
  );
});

test("RFC4180 CSV quotes delimiters, quotes, and newlines", () => {
  assert.equal(csvCell('A,"B"\nC'), '"A,""B""\nC"');
  assert.equal(
    toCsv([["Name", "Value"], ['A,"B"\nC', 12]]),
    'Name,Value\r\n"A,""B""\nC",12'
  );
});

test("CSV neutralizes spreadsheet formulas while retaining visible text", () => {
  for (const unsafe of ["=1+1", "+SUM(A:A)", "-2+3", "@cmd", "\t=1", "\r=1"]) {
    const safe = csvCell(unsafe);
    assert.equal(safe.startsWith("'") || safe.startsWith('"\'') , true);
    assert.equal(safe.includes(unsafe.trimStart()), true);
  }
});

test("API list query helpers bound page size and reject malformed search/filter values", () => {
  assert.equal(parsePageSize(undefined), 25);
  assert.equal(parsePageSize("500"), 100);
  assert.equal(parsePageSize("-2"), 1);
  assert.equal(parseSearch("  order 1001  "), "order 1001");
  assert.throws(() => parseSearch("<script>"), /Invalid search/);
  assert.equal(parseEnumFilter("active", new Set(["active"])), "active");
  assert.throws(
    () => parseEnumFilter("deleted", new Set(["active"])),
    /Invalid filter/
  );
});

test("page info exposes only opaque forward cursor state", () => {
  const records = Object.assign([{ id: "1" }], {
    hasNextPage: true,
    endCursor: "opaque",
  });
  assert.deepEqual(pageInfoFor(records), {
    hasNextPage: true,
    endCursor: "opaque",
  });
});

test("pagination resets atomically on filter changes and supports backward history", () => {
  let state = createPageState("query-a");
  state = nextPageState(state, "cursor-1");
  state = nextPageState(state, "cursor-2");
  assert.equal(state.cursor, "cursor-2");
  state = previousPageState(state);
  assert.equal(state.cursor, "cursor-1");
  state = previousPageState(state);
  assert.equal(state.cursor, "");
  assert.deepEqual(changePageQuery(state, "query-b"), {
    queryKey: "query-b",
    cursor: "",
    history: [],
  });
});

test("all operational routes use real page components instead of placeholders", () => {
  for (const component of [
    "DashboardPage",
    "ClientsPage",
    "OrdersPage",
    "ClaimsPage",
    "ErrorsPage",
    "ReportsPage",
    "InternalSettingsPage",
    "UsersPage",
  ]) {
    assert.match(appSource, new RegExp(`<${component}`));
  }
  assert.doesNotMatch(appSource, /ShellPlaceholderPage/);
});

test("operational pages expose accessible live status and mobile table labels", () => {
  for (const file of [
    "clients.jsx",
    "orders.jsx",
    "claims.jsx",
    "errors.jsx",
    "reports.jsx",
    "internalSettings.jsx",
    "users.jsx",
  ]) {
    const source = readFileSync(
      new URL(`../web/routes/${file}`, import.meta.url),
      "utf8"
    );
    assert.match(source, /role="status"|aria-live="polite"/);
  }
  const css = readFileSync(
    new URL("../web/routes/dashboard.css", import.meta.url),
    "utf8"
  );
  assert.match(css, /@media\s*\(max-width:\s*700px\)/);
  assert.match(css, /data-label/);
});
