import assert from "node:assert/strict";
import test from "node:test";

import { deriveLegacyClientRollups } from "../api/lib/legacyRollups.js";
import { projectLegacyClaim } from "../api/lib/unifiedClaims.js";

test("legacy client rollups match Laravel in-transit and open-claim semantics", () => {
  const clients = [{ id: "c1" }];
  const orders = [
    { clientId: "c1", valueMinor: 12500, currency: "USD", isShipped: false, status: "placed" },
    { clientId: "c1", valueMinor: 7500, currency: "USD", isShipped: true, status: "shipped" },
  ];
  const claims = [
    { clientId: "c1", status: "open" },
    { clientId: "c1", status: "closed" },
  ];
  assert.deepEqual(deriveLegacyClientRollups(clients, orders, claims).get("c1"), {
    valueInTransitMinor: 12500,
    valueInTransitCurrency: "USD",
    claimCount: 1,
  });
});

test("legacy claims project into the claims page contract as read-only records", () => {
  const claim = projectLegacyClaim({
    id: "lc1",
    sourceKey: "nova:claim:7",
    legacyId: "7",
    platform: "Miva",
    claimValueMinor: 1234,
    currency: "USD",
    status: "closed",
    submittedAt: "2026-07-28T00:00:00.000Z",
    client: { id: "c1", storeName: "SinisterDiesel" },
    legacyOrder: { id: "lo1", orderNumber: "RPP30033", valueMinor: 46866, currency: "USD" },
  });
  assert.equal(claim.status, "Closed");
  assert.equal(claim.source, "legacy");
  assert.equal(claim.readOnly, true);
  assert.equal(claim.order.name, "RPP30033");
  assert.equal(claim.orderValueMinor, 46866);
});
