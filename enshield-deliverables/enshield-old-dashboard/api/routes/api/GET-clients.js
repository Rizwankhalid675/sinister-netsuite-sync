import { PERMISSIONS } from "../../lib/permissions.js";
import { requireInternalAccess, shopIdFilter } from "../../lib/internalAccess.js";
import { pageInfoFor, parseEnumFilter, parsePageSize, parseSearch } from "../../lib/listQuery.js";

const STATUSES = new Set(["active", "paused", "onboarding", "churned"]);
const route = async ({ reply, api, logger, session, query = {} }) => {
  try {
    const access = await requireInternalAccess({ api, session }, PERMISSIONS.VIEW_CLIENTS, query.shopId);
    const clauses = [shopIdFilter(access.shopIds)];
    const search = parseSearch(query.search);
    const status = parseEnumFilter(query.status, STATUSES);
    if (search) clauses.push({ storeName: { contains: search } });
    if (status) clauses.push({ status: { equals: status } });
    const records = await api.client.findMany({
      filter: clauses.length === 1 ? clauses[0] : { AND: clauses },
      first: parsePageSize(query.first), after: query.after || undefined,
      sort: { createdAt: "Descending" },
      select: { id: true, storeName: true, storeId: true, plan: true, status: true, claimCount: true, valueInTransit: true, valueInTransitMinor: true, valueInTransitCurrency: true, createdAt: true },
    });
    await reply.send({ success: true, clients: [...records], pageInfo: pageInfoFor(records) });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error fetching clients");
    const statusCode = [400, 401, 403].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({ success: false, error: statusCode === 500 ? "Internal server error while fetching clients" : error.message });
  }
};
export default route;
