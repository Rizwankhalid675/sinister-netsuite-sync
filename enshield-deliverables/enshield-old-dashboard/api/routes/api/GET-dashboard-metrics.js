import { currencyOf, money } from "../../lib/money.js";
import {
  PERMISSIONS,
} from "../../lib/permissions.js";
import { requireInternalAccess, shopIdFilter } from "../../lib/internalAccess.js";
import {
  ORDER_CAP,
  isProtected,
  inTransit,
  isCancelled,
  isRefunded,
  isReturned,
  isFulfilled,
  normalizeRange,
  rangeStartFor,
  priorWindowFor,
  inRange,
  aggregateWindow,
  deriveMetrics,
} from "../../lib/metrics.js";
import { hasEnshieldProtection } from "../../lib/protection.js";
import { loadOpenClaimCount } from "../../lib/claimMetrics.js";
import { legacyOrderSelect, projectLegacyOrder } from "../../lib/unifiedOrders.js";
import { buildOperationalReport } from "../../lib/operationalReport.js";

/**
 * Route handler that aggregates real dashboard metrics for the CURRENT shop.
 *
 * This is a SINGLE-SHOP view. Because route context receives Gadget's
 * superuser API client, every read below carries an explicit session-derived
 * shop filter rather than relying on model access-control filters.
 *
 * Returns:
 *   - valueInTransit:   sum of order totals for unfulfilled / in-transit orders
 *   - protectedOrders:  count of orders that carry Enshield shipping protection
 *   - openClaims:       count of this shop's nonterminal claims
 *   - activity:         12-month buckets of order count + protected value
 *   - latestOrders:     most recent orders for the "Latest" table
 *
 * @type {RouteHandler<{ Querystring: { shopId?: string, year?: string } }>}
 */
const route = async ({ request, reply, api, logger, session }) => {
  try {
    const access = await requireInternalAccess(
      { api, session },
      PERMISSIONS.VIEW_DASHBOARD,
      request.query.shopId
    );
    const shopIds = access.shopIds;
    const tenantFilter = shopIdFilter(shopIds);
    const now = new Date();
    const year = Number(request.query.year) || now.getFullYear();

    // Route API clients are superusers; the explicit ID filter is mandatory.
    const shops = await api.shopifyShop.findMany({
      filter: shopIds.length === 1
        ? { id: { equals: shopIds[0] } }
        : { OR: shopIds.map((id) => ({ id: { equals: id } })) },
      first: 250,
      select: {
        id: true,
        name: true,
        domain: true,
        myshopifyDomain: true,
        shopifyCreatedAt: true,
      },
    });

    if (!shops.length || shops.hasNextPage) {
      await reply.code(404).send({ success: false, error: "Shop not found for this session" });
      return;
    }

    // Insurance setting -> drives the status indicator.
    const settings = await api.shippingInsuranceSetting.findMany({
      filter: tenantFilter,
      first: 250,
      select: { id: true, status: true, insuranceRate: true },
    }).catch(() => []);
    const setting = shopIds.length === 1 ? settings[0] : null;
    const shop = shops.length === 1 && !access.includesLegacy ? shops[0] : {
      id: "all",
      name: "All assigned clients",
      domain: null,
      shopifyCreatedAt: null,
    };

    // Pull this shop's orders. Gadget paginates at 250; page through defensively.
    // NOTE: shopifyCreatedAt has filterIndex/searchIndex disabled on this model,
    // so it is NOT sortable at the DB layer — sorting on it 500s. We fetch
    // unsorted and order in memory below.
    const ORDER_LIMIT = 15000;
    const orders = [];
    let records = await api.shopifyOrder.findMany({
      filter: tenantFilter,
      first: 250,
      select: {
        id: true,
        name: true,
        shopifyCreatedAt: true,
        processedAt: true,
        financialStatus: true,
        fulfillmentStatus: true,
        returnStatus: true,
        cancelledAt: true,
        noteAttributes: true,
        currency: true,
        enshieldProtectionAmountMinor: true,
        enshieldProtectionCurrency: true,
        enshieldPricingVersion: true,
        originalTotalPriceSet: true,
        currentTotalPriceSet: true,
        totalShippingPriceSet: true,
        totalRefundedSet: true,
      },
    });
    orders.push(...records);
    while (records.hasNextPage && orders.length < ORDER_LIMIT) {
      records = await records.nextPage();
      orders.push(...records);
    }
    const shopifyManagedOrderCount = orders.length;
    let mivaOrderCount = 0;
    if (access.includesLegacy) {
      let legacyRecords = await api.legacyOrder.findMany({
        first: 250,
        select: legacyOrderSelect(),
      });
      const legacyOrders = [...legacyRecords];
      while (legacyRecords.hasNextPage && legacyOrders.length < ORDER_LIMIT) {
        legacyRecords = await legacyRecords.nextPage();
        legacyOrders.push(...legacyRecords);
      }
      const projectedLegacyOrders = legacyOrders.map(projectLegacyOrder);
      mivaOrderCount = projectedLegacyOrders.filter((order) => order.source === "miva").length;
      orders.push(...projectedLegacyOrders);
    }
    // If we hit the cap there are still more orders we didn't aggregate — flag
    // it so the UI can tell the merchant the totals are partial (not a bug).
    const truncated = orders.length >= ORDER_LIMIT && records.hasNextPage;
    const currencies = [...new Set(
      orders.map((order) => currencyOf(order.currentTotalPriceSet)).filter(Boolean)
    )];
    if (currencies.length > 1) {
      const error = new Error("Select one client to view monetary totals; assigned clients use multiple currencies");
      error.statusCode = 422;
      throw error;
    }

    // Order most-recent-first in memory (DB sort on shopifyCreatedAt is disabled).
    orders.sort((a, b) => {
      const ta = a.shopifyCreatedAt ? new Date(a.shopifyCreatedAt).getTime() : 0;
      const tb = b.shopifyCreatedAt ? new Date(b.shopifyCreatedAt).getTime() : 0;
      return tb - ta;
    });

    // Range window: 7d / 30d / 90d / ytd / all. Filters which orders feed the
    // headline metrics. Defaults to 30d. `year` still drives the activity chart.
    // Predicates, money coercion, and range math live in api/lib/{money,metrics}.
    const range = normalizeRange(request.query.range);
    const rangeStart = rangeStartFor(range, now);

    // Prior window of equal length, for month-over-month / period deltas.
    const prior = priorWindowFor(rangeStart, now);
    const priorStart = prior?.start ?? null;

    const rate = Number(setting?.insuranceRate) || 0;

    const activity = Array.from({ length: 12 }, (_, m) => ({
      month: m,
      orders: 0,
      value: 0,
    }));

    for (const o of orders) {
      const total = money(o.currentTotalPriceSet);
      const d = o.shopifyCreatedAt ? new Date(o.shopifyCreatedAt) : null;
      if (d && d.getFullYear() === year) {
        const b = activity[d.getMonth()];
        b.orders += 1;
        b.value += total;
      }
    }

    // Range-scoped aggregate + matching prior window for period-over-period.
    const cur = aggregateWindow(orders, rangeStart, { rate, now });
    const priorAgg = priorStart
      ? aggregateWindow(orders, priorStart, {
          rate,
          now: rangeStart,
          endExclusive: true,
        })
      : null;

    const rangeOrders = cur.orders;
    const rangeProtectedOrders = cur.protectedOrders;
    const { insuranceMetrics, refundsReturns, revenueTrend, fulfillmentHealth } =
      deriveMetrics(cur, priorAgg);

    const latestOrders = orders.slice(0, 8).map((o) => ({
      id: o.id,
      name: o.name || o.id,
      value: money(o.currentTotalPriceSet),
      protected: hasEnshieldProtection(o),
      activeProtection: isProtected(o),
      financialStatus: o.financialStatus || null,
      fulfillmentStatus: o.fulfillmentStatus || null,
      createdAt: o.shopifyCreatedAt || null,
    }));
    let openClaims = (await Promise.all(
      shopIds.map((shopId) => loadOpenClaimCount(api, shopId))
    )).reduce((sum, count) => sum + count, 0);
    if (access.includesLegacy) {
      const terminalLegacyStatuses = new Set(["closed", "cancelled", "denied", "paid"]);
      let legacyClaims = await api.legacyClaim.findMany({
        first: 250,
        select: { id: true, status: true },
      });
      const legacyClaimRows = [...legacyClaims];
      while (legacyClaims.hasNextPage) {
        legacyClaims = await legacyClaims.nextPage();
        legacyClaimRows.push(...legacyClaims);
      }
      openClaims += legacyClaimRows.filter(
        (claim) => !terminalLegacyStatuses.has(String(claim.status || "").toLowerCase())
      ).length;
    }
    const operationalReport = buildOperationalReport(
      orders,
      Array.from({ length: openClaims }, () => ({ status: "open" })),
      { range, year, now, rate }
    );

    await reply.send({
      success: true,
      scope: shopIds.length === 1 && !access.includesLegacy ? "single-shop" : "assigned-shops",
      shopIds,
      shop: {
        id: shop.id,
        name: shop.name || shop.myshopifyDomain || shop.domain,
        domain: shop.domain,
        createdAt: shop.shopifyCreatedAt || null,
      },
      year,
      range,
      generatedAt: now.toISOString(),
      currency: currencies[0] || null,
      dataSources: {
        shopify: {
          status: "live",
          orderCount: shopifyManagedOrderCount,
        },
        miva: { status: mivaOrderCount > 0 ? "live" : "unavailable", orderCount: mivaOrderCount },
      },
      metrics: {
        valueInTransit: operationalReport.summary.valueInTransit,
        protectedOrders: operationalReport.summary.protectedOrders,
        activeProtectedOrders: operationalReport.summary.activeProtectedOrders,
        totalOrders: orders.length,
        // Range-scoped order count (headline metrics reflect the window).
        rangeOrders,
        openClaims,
        openClaimsAvailable: true,
        status: setting?.status || "inactive",
        insuranceRate: setting?.insuranceRate ?? null,
        // True when the shop has more than ORDER_CAP orders and the totals
        // above are aggregated from the most recent ORDER_CAP only.
        truncated,
      },
      insuranceMetrics: operationalReport.insuranceMetrics,
      refundsReturns: operationalReport.refundsReturns,
      revenueTrend: operationalReport.revenueTrend,
      fulfillmentHealth: operationalReport.fulfillmentHealth,
      activity: operationalReport.activity,
      sourceSplits: operationalReport.sourceSplits,
      latestOrders,
    });
  } catch (error) {
    logger.error(
      { errorName: error?.name, statusCode: error?.statusCode },
      "Error aggregating dashboard metrics"
    );
    const statusCode = [401, 403, 422, 503].includes(error.statusCode)
      ? error.statusCode
      : 500;
    await reply.code(statusCode).send({
      success: false,
      error:
        statusCode === 500
          ? "Internal server error while aggregating dashboard metrics"
          : error.message,
    });
  }
};

route.options = { cors: { origin: true } };

export default route;
