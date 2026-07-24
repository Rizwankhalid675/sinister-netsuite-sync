import { PERMISSIONS } from "../../lib/permissions.js";
import { requireInternalAccess, shopIdFilter } from "../../lib/internalAccess.js";
import { pageInfoFor, parseEnumFilter, parsePageSize, parseSearch } from "../../lib/listQuery.js";

const STATUSES = new Set(["active", "suspended", "revoked"]);
const route = async ({ reply, api, logger, session, query = {} }) => {
  try {
    const access = await requireInternalAccess({ api, session }, PERMISSIONS.VIEW_USERS, query.shopId);
    const clauses = [shopIdFilter(access.shopIds)];
    const search = parseSearch(query.search);
    const status = parseEnumFilter(query.status, STATUSES);
    if (search) clauses.push({ operator: { email: { contains: search } } });
    if (status) clauses.push({ status: { equals: status } });
    const records = await api.operatorShopAssignment.findMany({
      filter: clauses.length === 1 ? clauses[0] : { AND: clauses },
      first: parsePageSize(query.first), after: query.after || undefined,
      sort: { createdAt: "Descending" },
      select: {
        id: true, status: true, createdAt: true,
        operator: { id: true, name: true, email: true, status: true },
        role: { id: true, name: true },
        shop: { id: true, name: true, domain: true },
      },
    });
    const users = records.map((assignment) => ({
      id: assignment.id,
      name: assignment.operator?.name,
      email: assignment.operator?.email,
      operatorStatus: assignment.operator?.status,
      status: assignment.status,
      role: assignment.role,
      shop: assignment.shop,
      createdAt: assignment.createdAt,
    }));
    await reply.send({ success: true, users, pageInfo: pageInfoFor(records) });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error fetching users");
    const statusCode = [400, 401, 403, 503].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({ success: false, error: statusCode === 500 ? "Internal server error while fetching users" : error.message });
  }
};
export default route;
