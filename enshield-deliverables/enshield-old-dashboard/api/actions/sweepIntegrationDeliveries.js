import { createHash } from "node:crypto";
import {
  authorizeActionShop,
  PERMISSIONS,
} from "../lib/permissions.js";
import { enqueueDeliveryProcessor } from "../lib/integrationDelivery.js";

function continuationId(scope, cursor) {
  const digest = createHash("sha256")
    .update(`${scope}\0${String(cursor)}`)
    .digest("hex");
  return `delivery-sweep-${digest}`;
}

function sweepQueue(scope) {
  const digest = createHash("sha256").update(String(scope)).digest("hex");
  return {
    name: `integration-delivery-sweep-${digest}`,
    maxConcurrency: 1,
  };
}

async function enqueueContinuation({ api, params, scope, cursor, logger }) {
  try {
    await api.enqueue(api.sweepIntegrationDeliveries, params, {
      id: continuationId(scope, cursor),
      queue: sweepQueue(scope),
      retries: {
        retryCount: 10,
        initialInterval: 1000,
        maxInterval: 60_000,
        backoffFactor: 2,
      },
    });
    return true;
  } catch (error) {
    logger.warn(
      {
        code: "sweep_continuation_enqueue_failed",
        errorName: error?.name,
      },
      "Current sweep batch completed; a future scheduled sweep will recover"
    );
    return false;
  }
}

async function dispatchScheduledShopPage({ api, params, logger }) {
  const records = await api.shopifyShop.findMany({
    after: params.shopAfter || undefined,
    first: 250,
    select: { id: true },
  });
  let sweepsEnqueued = 0;
  for (const shop of records) {
    try {
      await api.enqueue(
        api.sweepIntegrationDeliveries,
        { shopId: shop.id, maxRecords: 250 },
        {
          queue: sweepQueue(`shop:${shop.id}`),
          retries: {
            retryCount: 10,
            initialInterval: 1000,
            maxInterval: 60_000,
            backoffFactor: 2,
          },
        }
      );
      sweepsEnqueued += 1;
    } catch (error) {
      logger.warn(
        {
          shopId: shop.id,
          code: "tenant_sweep_enqueue_failed",
          errorName: error?.name,
        },
        "Tenant sweep will be recovered by the next scheduled pass"
      );
    }
  }
  const cursor = records.endCursor;
  const continuationEnqueued =
    Boolean(records.hasNextPage && cursor) &&
    (await enqueueContinuation({
      api,
      params: {
        schedulerContinuation: true,
        shopAfter: cursor,
      },
      scope: "shops",
      cursor,
      logger,
    }));
  logger.info(
    {
      shopsExamined: records.length,
      sweepsEnqueued,
      continuationEnqueued,
    },
    "Scheduled integration delivery sweep page dispatched"
  );
  return {
    success: true,
    shopsExamined: records.length,
    sweepsEnqueued,
    continuationEnqueued,
  };
}

export const run = async ({ api, session, trigger, params = {}, logger }) => {
  const schedulerPage =
    (trigger?.type === "scheduler" && !session) ||
    (trigger?.type === "background-action" &&
      !session &&
      params.schedulerContinuation === true);
  if (schedulerPage) {
    return dispatchScheduledShopPage({ api, params, logger });
  }

  const shopId = await authorizeActionShop(
    { api, session, trigger, params },
    PERMISSIONS.MANAGE_ORDERS
  );
  const maxRecords = Math.min(
    1000,
    Math.max(1, Number.parseInt(params.maxRecords, 10) || 250)
  );
  const now = new Date().toISOString();
  const filter = {
    AND: [
      { shopId: { equals: shopId } },
      {
        OR: [
          { status: { equals: "queued" } },
          {
            AND: [
              { status: { equals: "retry" } },
              { nextAttemptAt: { lessThanOrEqual: now } },
            ],
          },
          {
            AND: [
              { status: { equals: "processing" } },
              { leaseExpiresAt: { lessThanOrEqual: now } },
            ],
          },
        ],
      },
    ],
  };
  const loadPage = (after, first) =>
    api.integrationDelivery.findMany({
      filter,
      after: after || undefined,
      first,
      select: { id: true },
    });
  let records = await loadPage(
    params.after,
    Math.min(250, maxRecords)
  );

  let examined = 0;
  let enqueued = 0;
  while (true) {
    for (const delivery of records) {
      if (examined >= maxRecords) break;
      examined += 1;
      if (
        await enqueueDeliveryProcessor({
          api,
          deliveryId: delivery.id,
          shopId,
          logger,
        })
      ) {
        enqueued += 1;
      }
    }
    if (!records.hasNextPage || examined >= maxRecords) break;
    const nextCursor = records.endCursor;
    if (!nextCursor) {
      throw new Error("Integration delivery page missing continuation cursor");
    }
    records = await loadPage(
      nextCursor,
      Math.min(250, maxRecords - examined)
    );
  }

  const cursor = records.endCursor;
  const continuationEnqueued =
    Boolean(records.hasNextPage && cursor) &&
    (await enqueueContinuation({
      api,
      params: {
        shopId,
        maxRecords,
        after: cursor,
      },
      scope: `shop:${shopId}`,
      cursor,
      logger,
    }));
  logger.info(
    { shopId, examined, enqueued, continuationEnqueued },
    "Integration delivery sweep batch completed"
  );
  return {
    success: true,
    examined,
    enqueued,
    continuationEnqueued,
    shopId,
  };
};

export const params = {
  shopId: { type: "string" },
  maxRecords: { type: "number" },
  after: { type: "string" },
  schedulerContinuation: { type: "boolean" },
  shopAfter: { type: "string" },
};

export const options = {
  triggers: {
    api: true,
    scheduler: [{ every: "minute" }],
  },
};
