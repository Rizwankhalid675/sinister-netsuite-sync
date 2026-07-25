import { PERMISSIONS, requireIdentity, requirePermission } from "../../lib/permissions.js";
import { pageInfoFor, parseEnumFilter, parsePageSize, parseSearch } from "../../lib/listQuery.js";

// Users page reads shop-scoped admin users (appUser) — the model that is
// actually self-service creatable by a Super Admin via MANAGE_USERS.
// (Internal Gadget-staff operatorShopAssignment records are a separate,
// owner-provisioned concept and are intentionally not exposed here.)
const STATUSES = new Set(["active", "invited", "deactivated"]);

const route = async ({ reply, api, logger, session, query = {} }) => {
  try {
    await requirePermission({ api, session }, PERMISSIONS.VIEW_USERS);
    const identity = await requireIdentity({ api, session });
    const clauses = [{ shop: { id: { equals: identity.shopId } } }];
    const search = parseSearch(query.search);
    const status = parseEnumFilter(query.status, STATUSES);
    if (search) {
      clauses.push({
        OR: [{ email: { contains: search } }, { name: { contains: search } }],
      });
    }
    if (status) clauses.push({ status: { equals: status } });
    const records = await api.appUser.findMany({
      filter: clauses.length === 1 ? clauses[0] : { AND: clauses },
      first: parsePageSize(query.first),
      after: query.after || undefined,
      sort: { createdAt: "Descending" },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        lastLoginAt: true,
        role: { id: true, name: true },
        shop: { id: true, name: true, domain: true },
      },
    });
    const users = records.map((user) => ({
      id: user.id,
      name: user.name,
      email: user.email,
      status: user.status,
      role: user.role,
      shop: user.shop,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
    }));
    await reply.send({ success: true, users, pageInfo: pageInfoFor(records) });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error fetching users");
    const statusCode = [400, 401, 403, 503].includes(error?.statusCode) ? error.statusCode : 500;
    await reply
      .code(statusCode)
      .send({ success: false, error: statusCode === 500 ? "Internal server error while fetching users" : error.message });
  }
};
export default route;
