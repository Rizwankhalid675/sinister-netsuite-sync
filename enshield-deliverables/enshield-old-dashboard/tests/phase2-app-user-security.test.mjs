import assert from "node:assert/strict";
import test from "node:test";

import {
  buildShopPersonKey,
  normalizePersonId,
  validateAppUserCreateInput,
  validateAppUserUpdateInput,
  validateCanonicalRole,
} from "../api/lib/appUserPolicy.js";
import { requireIdentity } from "../api/lib/permissions.js";
import { run as createAppUser } from "../api/models/appUser/actions/create.js";
import { run as updateAppUser } from "../api/models/appUser/actions/update.js";

test("person IDs normalize deterministically and form an unambiguous unique membership key", () => {
  assert.equal(normalizePersonId("  idp.subject-1  "), "idp.subject-1");
  assert.equal(
    buildShopPersonKey("shop-1", "  idp.subject-1  "),
    "shop-1:idp.subject-1"
  );
  for (const value of ["", "has:colon", "has space", null]) {
    assert.throws(() => normalizePersonId(value), /personId/);
  }
});

test("appUser create/update allowlists reject tenant and identity reassignment", () => {
  assert.doesNotThrow(() =>
    validateAppUserCreateInput({
      name: "Person",
      email: "person@example.test",
      role: { _link: "role-1" },
    })
  );
  for (const field of ["shop", "shopId", "shopPersonKey", "createdByEmail", "personId"]) {
    assert.throws(
      () => validateAppUserCreateInput({ [field]: "foreign" }),
      new RegExp(field.replace("Id", ""), "i")
    );
  }
  assert.doesNotThrow(() =>
    validateAppUserUpdateInput({
      name: "Renamed",
      role: { _link: "role-2" },
      status: "active",
    })
  );
  for (const field of ["shop", "shopId", "personId", "shopPersonKey"]) {
    assert.throws(
      () => validateAppUserUpdateInput({ [field]: "changed" }),
      new RegExp(field.replace("Id", ""), "i")
    );
  }
});

test("role validation accepts only a queried canonical role", () => {
  assert.equal(
    validateCanonicalRole({ id: "role-1", name: "Claims Manager" }, "role-1"),
    "role-1"
  );
  assert.throws(
    () => validateCanonicalRole({ id: "role-1", name: "Injected Role" }, "role-1"),
    /canonical/
  );
  assert.throws(
    () => validateCanonicalRole({ id: "other", name: "Claims Manager" }, "role-1"),
    /role/
  );
});

test("identity resolver fails closed for zero or duplicate active memberships", async () => {
  const session = {
    get(key) {
      return {
        shopId: "shop-1",
        roles: ["shopify-app-users"],
        personId: "subject-1",
      }[key];
    },
  };
  const pages = [
    [],
    [
      { id: "one", role: { name: "Claims Agent" } },
      { id: "two", role: { name: "Claims Agent" } },
    ],
  ];
  for (const rows of pages) {
    let options;
    const api = {
      shopifyShop: { async findFirst() { return { id: "shop-1" }; } },
      appUser: {
        async findMany(input) {
          options = input;
          return Object.assign(rows, { hasNextPage: false });
        },
      },
    };
    await assert.rejects(
      requireIdentity({ api, session }),
      (error) => error.statusCode === 403
    );
    assert.equal(options.first, 2);
    assert.deepEqual(options.filter, {
      AND: [
        { shopPersonKey: { equals: "shop-1:subject-1" } },
        { shopId: { equals: "shop-1" } },
        { personId: { equals: "subject-1" } },
        { status: { equals: "active" } },
      ],
    });
  }
});

test("appUser actions reject foreign reassignment and duplicate membership before persistence", async () => {
  const adminSession = {
    get(key) {
      return {
        shopId: "shop-1",
        roles: ["shopify-app-users"],
        personId: "admin-subject",
      }[key];
    },
  };
  let writes = 0;
  const membership = {
    id: "admin-1",
    name: "Admin",
    email: "admin@example.test",
    personId: "admin-subject",
    status: "active",
    role: { name: "Super Admin" },
  };
  const api = {
    shopifyShop: { async findFirst() { return { id: "shop-1" }; } },
    appRole: {
      async findFirst() {
        return { id: "role-claims", name: "Claims Agent" };
      },
    },
    appUser: {
      async findMany(options) {
        const key = options.filter.AND[0].shopPersonKey.equals;
        if (key === "shop-1:admin-subject") {
          return Object.assign([membership], { hasNextPage: false });
        }
        return Object.assign([{ id: "duplicate" }], { hasNextPage: false });
      },
      async findFirst() {
        // No collision on the server-generated personId candidate.
        return null;
      },
    },
    internal: {
      appUser: {
        async create() { writes += 1; },
        async update() { writes += 1; },
      },
    },
  };

  await assert.rejects(
    createAppUser({
      params: {
        appUser: {
          name: "Malicious",
          email: "x@example.test",
          role: { _link: "role-claims" },
          shop: { _link: "shop-2" },
        },
      },
      record: {},
      api,
      session: adminSession,
      logger: {},
    }),
    /shop/i
  );
  await assert.rejects(
    updateAppUser({
      params: { appUser: { personId: "reassigned" } },
      record: { id: "target", shopId: "shop-1" },
      api,
      session: adminSession,
      logger: {},
    }),
    /person/i
  );
  await assert.rejects(
    createAppUser({
      params: {
        appUser: {
          name: "Duplicate",
          email: "d@example.test",
          role: { _link: "role-claims" },
        },
      },
      record: {},
      api,
      session: adminSession,
      logger: {},
    }),
    (error) => error.statusCode === 409
  );
  assert.equal(writes, 0);
});

test("all touched action modules dynamically import without runtime type imports", async () => {
  for (const path of [
    "../api/models/claim/actions/create.js",
    "../api/models/claim/actions/update.js",
    "../api/models/appUser/actions/create.js",
    "../api/models/appUser/actions/update.js",
    "../api/models/appUser/actions/delete.js",
    "../api/actions/reconcileClients.js",
  ]) {
    const module = await import(path);
    assert.equal(typeof module.run, "function", path);
  }
});
