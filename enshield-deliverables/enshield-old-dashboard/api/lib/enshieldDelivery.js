import { isProtectionEligible } from "./protection.js";
import { sanitizeDeliveryError } from "./integrationDelivery.js";

function numericOrderId(sourceId) {
  return String(sourceId).split("/").pop();
}

async function send({ url, body, apiKey, deliveryKey, method = "POST", fetchImpl }) {
  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "X-Api-Key": apiKey,
        "Idempotency-Key": deliveryKey,
        "X-Enshield-Idempotency-Key": deliveryKey,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    // Consume but never retain/log response bodies, which may contain PII.
    await response.text();
    if (response.ok) return { ok: true, statusCode: response.status };
    const classification = sanitizeDeliveryError(null, response.status);
    return {
      ok: false,
      statusCode: response.status,
      retryable: classification.retryable,
      errorCode: classification.code,
    };
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      errorCode: sanitizeDeliveryError(error).code,
    };
  }
}

async function deliverTracking({
  delivery,
  shopifyClient,
  apiKey,
  fetchImpl,
}) {
  const resourceId = delivery.metadata?.resourceId || delivery.sourceId;
  const orderId = String(resourceId).startsWith("gid://")
    ? resourceId
    : `gid://shopify/Order/${resourceId}`;
  const response = await shopifyClient.graphql(
    `query deliveryTracking($id: ID!) {
      order(id: $id) {
        fulfillments { trackingInfo { number } }
      }
    }`,
    { id: orderId }
  );
  const trackingNumber = response?.order?.fulfillments
    ?.flatMap((item) => item.trackingInfo || [])
    .map((item) => item.number)
    .find(Boolean);
  if (!trackingNumber) {
    return { ok: false, retryable: false, errorCode: "TRACKING_NOT_FOUND" };
  }
  return send({
    url: `https://staging.manage.enshield.com/api/orders/miva/${numericOrderId(resourceId)}/store-tracking-number`,
    body: { tracking_number: trackingNumber },
    apiKey,
    deliveryKey: delivery.deliveryKey,
    fetchImpl,
  });
}

async function deliverOrder({ delivery, shopifyClient, apiKey, fetchImpl }) {
  const orderId = String(delivery.sourceId).startsWith("gid://")
    ? delivery.sourceId
    : `gid://shopify/Order/${delivery.sourceId}`;
  const response = await shopifyClient.graphql(
    `query deliveryOrder($id: ID!) {
      order(id: $id) {
        id name email phone cancelledAt displayFinancialStatus
        totalPriceSet { shopMoney { amount currencyCode } }
        currentTotalPriceSet { shopMoney { amount currencyCode } }
        totalRefundedSet { shopMoney { amount currencyCode } }
        billingAddress { name firstName lastName address1 address2 city province provinceCode country countryCode zip phone }
        shippingAddress { name firstName lastName address1 address2 city province provinceCode country countryCode zip phone }
        customAttributes { key value }
        lineItems(first: 100) {
          edges { node { id name quantity sku originalUnitPriceSet { shopMoney { amount } } } }
        }
      }
    }`,
    { id: orderId }
  );
  const order = response?.order;
  if (!order) return { ok: false, retryable: false, errorCode: "ORDER_NOT_FOUND" };
  if (
    !isProtectionEligible({
      ...order,
      financialStatus: order.displayFinancialStatus?.toLowerCase(),
    })
  ) {
    return { ok: false, retryable: false, errorCode: "NOT_PROTECTED" };
  }
  const billing = order.billingAddress || {};
  const shipping = order.shippingAddress || billing;
  const customerName =
    billing.name ||
    [billing.firstName, billing.lastName].filter(Boolean).join(" ") ||
    order.email ||
    "Unknown Customer";
  const body = {
    customer_name: customerName,
    customer_email: order.email || "",
    order_value: order.totalPriceSet?.shopMoney?.amount || "0",
    customer_address: shipping.address1 || "",
    customer_address2: shipping.address2 || "",
    customer_city: shipping.city || "",
    customer_state: shipping.province || shipping.provinceCode || "",
    customer_country: shipping.country || shipping.countryCode || "",
    customer_zip: shipping.zip || "",
    customer_phone: order.phone || shipping.phone || billing.phone || "0",
    products: (order.lineItems?.edges || []).map(({ node }) => ({
      sku: node.sku || node.id || "0",
      name: node.name || "",
      items: node.quantity || 1,
      item_amount: node.originalUnitPriceSet?.shopMoney?.amount || "0",
    })),
  };
  return send({
    url: `https://staging.manage.enshield.com/api/orders/miva/${numericOrderId(delivery.sourceId)}`,
    body,
    apiKey,
    deliveryKey: delivery.deliveryKey,
    fetchImpl,
  });
}

async function deliverDelete({ delivery, apiKey, fetchImpl }) {
  return send({
    url: `https://staging.manage.enshield.com/api/orders/miva/${numericOrderId(delivery.sourceId)}`,
    body: undefined,
    apiKey,
    deliveryKey: delivery.deliveryKey,
    method: "DELETE",
    fetchImpl,
  });
}

export async function deliverToEnshield({
  delivery,
  shopifyClient,
  apiKey,
  logger,
  fetchImpl = fetch,
}) {
  if (!apiKey) {
    return { ok: false, retryable: false, errorCode: "CONFIGURATION_MISSING" };
  }
  logger.info(
    { operation: delivery.operation },
    "Processing persisted Enshield delivery"
  );
  try {
    if (delivery.operation === "tracking.submit") {
      return await deliverTracking({
        delivery,
        shopifyClient,
        apiKey,
        fetchImpl,
      });
    }
    if (delivery.operation === "order.submit") {
      return await deliverOrder({
        delivery,
        shopifyClient,
        apiKey,
        fetchImpl,
      });
    }
    if (delivery.operation === "order.delete") {
      return await deliverDelete({ delivery, apiKey, fetchImpl });
    }
  } catch (error) {
    return {
      ok: false,
      retryable: true,
      errorCode: sanitizeDeliveryError(error).code,
    };
  }
  return { ok: false, retryable: false, errorCode: "UNKNOWN_OPERATION" };
}
