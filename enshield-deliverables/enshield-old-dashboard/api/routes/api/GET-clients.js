import { PERMISSIONS } from "../../lib/permissions.js";
import { requireInternalAccess, shopIdFilter } from "../../lib/internalAccess.js";
import { pageInfoFor, parseEnumFilter, parsePageSize, parseSearch } from "../../lib/listQuery.js";
import { deriveLegacyClientRollups } from "../../lib/legacyRollups.js";

const STATUSES = new Set(["active", "paused", "onboarding", "churned"]);
const route = async ({ reply, api, logger, session, query = {} }) => {
  try {
    const access = await requireInternalAccess({ api, session }, PERMISSIONS.VIEW_CLIENTS, query.shopId);
    const clauses = [shopIdFilter(access.shopIds, access.includesLegacy)];
    const search = parseSearch(query.search);
    const status = parseEnumFilter(query.status, STATUSES);
    if (search) clauses.push({ storeName: { contains: search } });
    if (status) clauses.push({ status: { equals: status } });
    const records = await api.client.findMany({
      filter: clauses.length === 1 ? clauses[0] : { AND: clauses },
      first: parsePageSize(query.first), after: query.after || undefined,
      sort: { createdAt: "Descending" },
      select: { id: true, storeName: true, storeId: true, platform: true, plan: true, status: true, claimCount: true, valueInTransit: true, valueInTransitMinor: true, valueInTransitCurrency: true, createdAt: true },
    });
    const clients = [...records];
    if (access.includesLegacy) {
      const legacyClientIds = clients.filter((client) => !client.storeId || String(client.storeId).startsWith("ENS") || String(client.storeId).length > 20).map((client) => client.id);
      if (legacyClientIds.length) {
        const clientFilter = { OR: legacyClientIds.map((id) => ({ clientId: { equals: id } })) };
        const [orders, claims] = await Promise.all([
          api.legacyOrder.findMany({ filter: clientFilter, first: 250, select: { id: true, clientId: true, valueMinor: true, currency: true, status: true, isShipped: true } }),
          api.legacyClaim.findMany({ filter: clientFilter, first: 250, select: { id: true, clientId: true, status: true } }),
        ]);
        const allOrders = [...orders];
        let orderPage = orders;
        while (orderPage.hasNextPage && allOrders.length < 10_000) { orderPage = await orderPage.nextPage(); allOrders.push(...orderPage); }
        const allClaims = [...claims];
        let claimPage = claims;
        while (claimPage.hasNextPage && allClaims.length < 10_000) { claimPage = await claimPage.nextPage(); allClaims.push(...claimPage); }
        const rollups = deriveLegacyClientRollups(clients, allOrders, allClaims);
        for (const client of clients) Object.assign(client, rollups.get(String(client.id)) || {});
      }
    }
    await reply.send({ success: true, clients, pageInfo: pageInfoFor(records) });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error fetching clients");
    const statusCode = [400, 401, 403].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({ success: false, error: statusCode === 500 ? "Internal server error while fetching clients" : error.message });
  }
};
export default route;
