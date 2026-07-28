const CLOSED_CLAIM_STATUSES = new Set(["closed", "paid", "denied", "cancelled", "canceled"]);
const SHIPPED_ORDER_STATUSES = new Set(["shipped", "fulfilled", "delivered", "complete", "completed"]);

const relationId = (record, name) => String(record?.[`${name}Id`] ?? record?.[name]?.id ?? "");

export function deriveLegacyClientRollups(clients = [], orders = [], claims = []) {
  const rollups = new Map(clients.map((client) => [String(client.id), {
    valueInTransitMinor: 0,
    valueInTransitCurrency: "USD",
    claimCount: 0,
  }]));

  for (const order of orders) {
    const rollup = rollups.get(relationId(order, "client"));
    if (!rollup) continue;
    const status = String(order?.status || "").toLowerCase();
    if (order?.isShipped !== true && !SHIPPED_ORDER_STATUSES.has(status) && !status.includes("cancel")) {
      rollup.valueInTransitMinor += Number(order?.valueMinor || 0);
      rollup.valueInTransitCurrency = String(order?.currency || rollup.valueInTransitCurrency).toUpperCase();
    }
  }

  for (const claim of claims) {
    const rollup = rollups.get(relationId(claim, "client"));
    if (!rollup) continue;
    if (!CLOSED_CLAIM_STATUSES.has(String(claim?.status || "").toLowerCase())) rollup.claimCount += 1;
  }
  return rollups;
}
