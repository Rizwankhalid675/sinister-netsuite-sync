import { PERMISSIONS } from "../../lib/permissions.js";
import { requireInternalAccess, shopIdFilter } from "../../lib/internalAccess.js";
import { parseEnumFilter, parsePageSize, parseSearch, pageInfoFor } from "../../lib/listQuery.js";
import { currencyOf, money } from "../../lib/money.js";
import { hasEnshieldProtection } from "../../lib/protection.js";
import { legacyOrderSelect, projectLegacyOrder } from "../../lib/unifiedOrders.js";

const STATUSES = new Set(["fulfilled", "in_transit", "unfulfilled", "cancelled"]);
const UNIFIED_CAP = 15000;

const shopifySelect = {
  id: true, name: true, currentTotalPriceSet: true, noteAttributes: true,
  financialStatus: true, fulfillmentStatus: true, cancelledAt: true,
  shopifyCreatedAt: true, enshieldProtectionAmountMinor: true,
  enshieldProtectionCurrency: true,
  shop: { id: true, name: true, domain: true },
};

const outputOrder = (order) => ({
  id: order.id,
  name: order.name,
  source: order.source || "shopify",
  value: money(order.currentTotalPriceSet),
  currency: currencyOf(order.currentTotalPriceSet) || "USD",
  protected: hasEnshieldProtection(order),
  protectionAmountMinor: order.enshieldProtectionAmountMinor ?? null,
  protectionCurrency: order.enshieldProtectionCurrency ?? null,
  financialStatus: order.financialStatus || null,
  fulfillmentStatus: order.cancelledAt ? "cancelled" : order.fulfillmentStatus || null,
  createdAt: order.shopifyCreatedAt || null,
  shop: order.shop,
});

const matchesStatus = (order, status) => {
  if (!status) return true;
  if (status === "cancelled") return Boolean(order.cancelledAt);
  if (status === "fulfilled") return order.fulfillmentStatus === "fulfilled";
  if (status === "unfulfilled") return order.fulfillmentStatus === "unfulfilled";
  return order.fulfillmentStatus === "in_progress" || order.fulfillmentStatus === "unfulfilled";
};

async function loadAll(records, cap) {
  const rows = [...records];
  while (records.hasNextPage && rows.length < cap) {
    records = await records.nextPage();
    rows.push(...records);
  }
  return rows;
}

const route = async ({ reply, api, logger, session, query = {} }) => {
  try {
    const access = await requireInternalAccess({ api, session }, PERMISSIONS.VIEW_ORDERS, query.shopId);
    const first = parsePageSize(query.first);
    const search = parseSearch(query.search);
    const status = parseEnumFilter(query.status, STATUSES);

    if (access.includesLegacy) {
      const shopifyRecords = await api.shopifyOrder.findMany({
        filter: shopIdFilter(access.shopIds),
        first: 250,
        select: shopifySelect,
      });
      const legacyRecords = await api.legacyOrder.findMany({
        first: 250,
        select: legacyOrderSelect(),
      });
      const combined = [
        ...(await loadAll(shopifyRecords, UNIFIED_CAP)),
        ...(await loadAll(legacyRecords, UNIFIED_CAP)).map(projectLegacyOrder),
      ]
        .filter((order) => !search || String(order.name || "").toLowerCase().includes(search.toLowerCase()))
        .filter((order) => matchesStatus(order, status))
        .sort((a, b) => new Date(b.shopifyCreatedAt || 0) - new Date(a.shopifyCreatedAt || 0));
      const offsetMatch = String(query.after || "").match(/^unified:(\d+)$/);
      const offset = offsetMatch ? Number(offsetMatch[1]) : 0;
      const page = combined.slice(offset, offset + first).map(outputOrder);
      const nextOffset = offset + page.length;
      await reply.send({
        success: true,
        orders: page,
        pageInfo: {
          hasNextPage: nextOffset < combined.length,
          endCursor: nextOffset < combined.length ? `unified:${nextOffset}` : null,
        },
      });
      return;
    }

    const clauses = [shopIdFilter(access.shopIds)];
    if (search) clauses.push({ name: { contains: search } });
    if (status === "cancelled") clauses.push({ cancelledAt: { isSet: true } });
    else if (status === "fulfilled") clauses.push({ fulfillmentStatus: { equals: "fulfilled" } });
    else if (status === "unfulfilled") clauses.push({ fulfillmentStatus: { equals: "unfulfilled" } });
    else if (status === "in_transit") clauses.push({ fulfillmentStatus: { equals: "in_progress" } });

    const records = await api.shopifyOrder.findMany({
      filter: clauses.length === 1 ? clauses[0] : { AND: clauses },
      first,
      after: query.after || undefined,
      sort: { shopifyCreatedAt: "Descending" },
      select: shopifySelect,
    });
    await reply.send({ success: true, orders: records.map(outputOrder), pageInfo: pageInfoFor(records) });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error fetching orders");
    const statusCode = [400, 401, 403].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({ success: false, error: statusCode === 500 ? "Internal server error while fetching orders" : error.message });
  }
};

export default route;
