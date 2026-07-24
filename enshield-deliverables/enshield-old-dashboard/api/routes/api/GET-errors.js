import { PERMISSIONS } from "../../lib/permissions.js";
import { requireInternalAccess, shopIdFilter } from "../../lib/internalAccess.js";

const ALLOWED_STATUSES = new Set([
  "retry",
  "permanent_failure",
]);

const route = async ({ reply, api, logger, session, query = {} }) => {
  try {
    const access = await requireInternalAccess(
      { api, session },
      PERMISSIONS.VIEW_ERRORS,
      query.shopId
    );
    const first = Math.min(100, Math.max(1, Number.parseInt(query.first, 10) || 50));
    const clauses = [shopIdFilter(access.shopIds)];
    if (query.status) {
      if (!ALLOWED_STATUSES.has(query.status)) {
        const error = new Error("Invalid status filter");
        error.statusCode = 400;
        throw error;
      }
      clauses.push({ status: { equals: query.status } });
    } else {
      clauses.push({
        OR: [
          { status: { equals: "retry" } },
          { status: { equals: "permanent_failure" } },
        ],
      });
    }
    if (query.operation) {
      if (!/^[a-z][a-z0-9_.-]{0,63}$/i.test(query.operation)) {
        const error = new Error("Invalid operation filter");
        error.statusCode = 400;
        throw error;
      }
      clauses.push({ operation: { equals: query.operation } });
    }
    const records = await api.integrationDelivery.findMany({
      filter: clauses.length === 1 ? clauses[0] : { AND: clauses },
      first,
      after: query.after || undefined,
      sort: { updatedAt: "Descending" },
      select: {
        id: true,
        deliveryKey: true,
        operation: true,
        status: true,
        attemptCount: true,
        lastStatusCode: true,
        lastErrorCode: true,
        lastAttemptAt: true,
        nextAttemptAt: true,
        updatedAt: true,
        metadata: true,
        shop: { id: true, name: true, domain: true },
      },
    });
    const errors = records.map((record) => ({
      id: record.id,
      operation: record.operation,
      sourceRef: String(record.deliveryKey).slice(0, 14),
      status: record.status,
      attemptCount: record.attemptCount,
      lastStatusCode: record.lastStatusCode,
      lastErrorCode: record.lastErrorCode,
      lastAttemptAt: record.lastAttemptAt,
      nextAttemptAt: record.nextAttemptAt,
      updatedAt: record.updatedAt,
      metadata: {
        endpoint: record.metadata?.endpoint,
        resourceType: record.metadata?.resourceType,
      },
      shop: record.shop,
    }));
    await reply.send({
      success: true,
      errors,
      pageInfo: {
        hasNextPage: Boolean(records.hasNextPage),
        endCursor: records.endCursor || null,
      },
    });
  } catch (error) {
    logger.error(
      { errorName: error?.name, statusCode: error?.statusCode },
      "Error fetching integration deliveries"
    );
    const statusCode = [400, 401, 403].includes(error?.statusCode)
      ? error.statusCode
      : 500;
    await reply.code(statusCode).send({
      success: false,
      error:
          statusCode === 500
          ? "Internal server error while fetching operational errors"
          : error.message,
    });
  }
};

export default route;
