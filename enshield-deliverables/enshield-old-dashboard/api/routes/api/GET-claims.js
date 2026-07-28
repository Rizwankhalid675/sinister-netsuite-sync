import { PERMISSIONS } from "../../lib/permissions.js";
import { requireInternalAccess, shopIdFilter } from "../../lib/internalAccess.js";
import { pageInfoFor, parseEnumFilter, parsePageSize, parseSearch } from "../../lib/listQuery.js";
import { legacyClaimSelect, projectLegacyClaim } from "../../lib/unifiedClaims.js";

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
    const claims = [...records].map((claim) => ({ ...claim, source: "shopify", readOnly: false }));
    if (access.includesLegacy && !query.after) {
      const legacyRecords = await api.legacyClaim.findMany({ first: parsePageSize(query.first), sort: { submittedAt: "Descending" }, select: legacyClaimSelect() });
      const normalizedSearch = search.toLowerCase();
      claims.push(...[...legacyRecords].map(projectLegacyClaim).filter((claim) =>
        (!status || claim.status === status) && (!normalizedSearch || String(claim.order?.name || "").toLowerCase().includes(normalizedSearch) || String(claim.client?.storeName || "").toLowerCase().includes(normalizedSearch))
      ));
      claims.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
    }
    await reply.send({ success: true, claims: claims.slice(0, parsePageSize(query.first)), pageInfo: pageInfoFor(records) });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error fetching claims");
    const statusCode = [400, 401, 403].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({ success: false, error: statusCode === 500 ? "Internal server error while fetching claims" : error.message });
  }
};
export default route;
