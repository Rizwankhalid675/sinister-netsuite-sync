const amountString = (minor) => (Number(minor || 0) / 100).toFixed(2);

const normalizedPlatform = (value) =>
  String(value || "unknown").toLowerCase().startsWith("miva") ? "miva" : "shopify";

export function projectLegacyOrder(order) {
  const status = String(order?.status || "unknown").toLowerCase();
  const cancelled = status.includes("cancel");
  const refunded = status.includes("refund") || status.includes("void");
  const fulfilled = order?.isShipped === true || status.includes("ship") || status.includes("fulfill") || status.includes("deliver") || status.includes("complete");
  const protectedOrder = Number(order?.protectionCostMinor || 0) > 0;
  const currency = String(order?.currency || "USD").toUpperCase();
  return {
    id: `legacy:${order.id}`,
    legacyRecordId: order.id,
    sourceKey: order.sourceKey,
    source: normalizedPlatform(order.platform),
    platform: order.platform,
    name: order.orderNumber || order.legacyId || order.id,
    shopifyCreatedAt: order.placedAt || null,
    processedAt: order.placedAt || null,
    financialStatus: refunded ? "refunded" : "paid",
    fulfillmentStatus: fulfilled ? "fulfilled" : "unfulfilled",
    trackingNumber: order.trackingNumber || null,
    returnStatus: null,
    cancelledAt: cancelled ? order.placedAt || new Date(0).toISOString() : null,
    noteAttributes: protectedOrder
      ? [
          { name: "shippingInsurance", value: "true" },
          { name: "shippingInsuranceCost", value: amountString(order.protectionCostMinor) },
        ]
      : [],
    currency,
    enshieldProtectionAmountMinor: protectedOrder ? Number(order.protectionCostMinor) : null,
    enshieldProtectionCurrency: protectedOrder ? currency : null,
    enshieldPricingVersion: protectedOrder ? "legacy-nova" : null,
    currentTotalPriceSet: {
      shopMoney: { amount: amountString(order.valueMinor), currencyCode: currency },
    },
    originalTotalPriceSet: {
      shopMoney: { amount: amountString(order.valueMinor), currencyCode: currency },
    },
    totalShippingPriceSet: {
      shopMoney: { amount: amountString(order.shippingMinor), currencyCode: currency },
    },
    totalRefundedSet: {
      shopMoney: { amount: refunded ? amountString(order.valueMinor) : "0.00", currencyCode: currency },
    },
    shop: order.client
      ? { id: `legacy:${order.client.id}`, name: order.client.storeName, domain: null }
      : null,
  };
}

export function legacyOrderSelect() {
  return {
    id: true,
    sourceKey: true,
    legacyId: true,
    platform: true,
    orderNumber: true,
    valueMinor: true,
    protectionCostMinor: true,
    taxMinor: true,
    shippingMinor: true,
    currency: true,
    status: true,
    isShipped: true,
    trackingNumber: true,
    placedAt: true,
    client: { id: true, storeName: true, legacySourceKey: true },
  };
}
