import { PERMISSIONS } from "../../lib/permissions.js";
import { requireInternalAccess, shopIdFilter } from "../../lib/internalAccess.js";
import { pageInfoFor, parseEnumFilter, parsePageSize, parseSearch } from "../../lib/listQuery.js";

const STATUSES = new Set(["Draft", "Submitted", "New", "Under Review", "Awaiting Customer", "Awaiting Merchant", "Awaiting Carrier", "Approved", "Partially Approved", "Denied", "Payment Pending", "Paid", "Closed", "Reopened", "Cancelled"]);
const route = async ({ reply, api, logger, session, query = {} }) => {
  try {
    const access = await requireInternalAccess({ api, session }, PERMISSIONS.VIEW_CLAIMS, query.shopId);
    const clauses = [shopIdFilter(access.shopIds)];
    const search = parseSearch(query.search);
    const status = parseEnumFilter(query.status, STATUSES);
    if (search) clauses.push({ customerEmail: { contains: search } });
    if (status) clauses.push({ status: { equals: status } });
    const records = await api.claim.findMany({
      filter: clauses.length === 1 ? clauses[0] : { AND: clauses },
      first: parsePageSize(query.first), after: query.after || undefined,
      sort: { createdAt: "Descending" },
      select: { id: true, status: true, reason: true, claimValue: true, claimValueMinor: true, claimCurrency: true, orderValue: true, orderValueMinor: true, orderCurrency: true, createdAt: true, order: { id: true, name: true }, client: { id: true, storeName: true } },
    });
    await reply.send({ success: true, claims: [...records], pageInfo: pageInfoFor(records) });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error fetching claims");
    const statusCode = [400, 401, 403].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({ success: false, error: statusCode === 500 ? "Internal server error while fetching claims" : error.message });
  }
};
export default route;
