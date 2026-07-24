import { PERMISSIONS } from "../../lib/permissions.js";
import { requireInternalAccess, shopIdFilter } from "../../lib/internalAccess.js";
import { pageInfoFor, parseEnumFilter, parsePageSize, parseSearch } from "../../lib/listQuery.js";

const ACTIONS = new Set(["create", "update", "delete", "approve", "reject"]);

const route = async ({ reply, api, logger, session, query = {} }) => {
  try {
    const access = await requireInternalAccess({ api, session }, PERMISSIONS.VIEW_AUDIT, query.shopId);
    const clauses = [shopIdFilter(access.shopIds)];
    const search = parseSearch(query.search);
    const action = parseEnumFilter(query.action, ACTIONS);
    if (search) clauses.push({ OR: [{ actorEmail: { contains: search } }, { entityType: { contains: search } }, { entityId: { contains: search } }] });
    if (action) clauses.push({ action: { equals: action } });
    const records = await api.auditLog.findMany({
      filter: clauses.length === 1 ? clauses[0] : { AND: clauses },
      first: parsePageSize(query.first), after: query.after || undefined,
      sort: { createdAt: "Descending" },
      select: {
        id: true, createdAt: true, actorEmail: true, action: true,
        entityType: true, entityId: true, before: true, after: true,
      },
    });
    const entries = [...records];
    await reply.send({ success: true, entries, pageInfo: pageInfoFor(records) });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error fetching audit log");
    const statusCode = [400, 401, 403, 503].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({ success: false, error: statusCode === 500 ? "Internal server error while fetching audit log" : error.message });
  }
};
export default route;
