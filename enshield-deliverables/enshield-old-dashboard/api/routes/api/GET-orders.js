import { PERMISSIONS } from "../../lib/permissions.js";
import { requireInternalAccess, shopIdFilter } from "../../lib/internalAccess.js";
import { parseEnumFilter, parsePageSize, parseSearch, pageInfoFor } from "../../lib/listQuery.js";
import { currencyOf, money } from "../../lib/money.js";
import { hasEnshieldProtection } from "../../lib/protection.js";

const STATUSES = new Set(["fulfilled", "in_transit", "unfulfilled", "cancelled"]);

const route = async ({ reply, api, logger, session, query = {} }) => {
  try {
    const access = await requireInternalAccess({ api, session }, PERMISSIONS.VIEW_ORDERS, query.shopId);
    const first = parsePageSize(query.first);
    const search = parseSearch(query.search);
    const status = parseEnumFilter(query.status, STATUSES);
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
      select: {
        id: true, name: true, currentTotalPriceSet: true, noteAttributes: true,
        financialStatus: true, fulfillmentStatus: true, cancelledAt: true,
        shopifyCreatedAt: true, enshieldProtectionAmountMinor: true,
        enshieldProtectionCurrency: true,
        shop: { id: true, name: true, domain: true },
      },
    });
    const orders = records.map((order) => ({
      id: order.id,
      name: order.name,
      value: money(order.currentTotalPriceSet),
      currency: currencyOf(order.currentTotalPriceSet) || "USD",
      protected: hasEnshieldProtection(order),
      protectionAmountMinor: order.enshieldProtectionAmountMinor ?? null,
      protectionCurrency: order.enshieldProtectionCurrency ?? null,
      financialStatus: order.financialStatus || null,
      fulfillmentStatus: order.cancelledAt ? "cancelled" : order.fulfillmentStatus || null,
      createdAt: order.shopifyCreatedAt || null,
      shop: order.shop,
    }));
    await reply.send({ success: true, orders, pageInfo: pageInfoFor(records) });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error fetching orders");
    const statusCode = [400, 401, 403].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({ success: false, error: statusCode === 500 ? "Internal server error while fetching orders" : error.message });
  }
};

export default route;
