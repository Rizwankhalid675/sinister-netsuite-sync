import crypto from "node:crypto";

import {
  buildWebhookDeliveryKey,
  safeDeliveryLogId,
  verifyShopifyWebhook,
} from "../../../lib/verifyShopifyWebhook.js";
import {
  hasDeliveryKeyUniqueViolation,
  acquireWebhookAttempt,
  constantTimeHexEqual,
  normalizeShopDomain,
  normalizeWebhookTopic,
} from "../../../lib/webhookReceiptLease.js";
import {
  calculateProtectionPrice,
  ENSHIELD_PROTECTION_ATTRIBUTE,
  formatMinorAmount,
  selectProtectionPricing,
} from "../../../lib/protection.js";

const header = (request, name) => request.headers?.[name];

const shopDomainHash = (shopDomain) =>
  crypto.createHash("sha256").update(String(shopDomain ?? "")).digest("hex");

async function processCartUpdate({ cartData, shopId, shopCurrency, api, connections }) {
  if (!cartData || typeof cartData !== "object" || !cartData.token) {
    const error = new Error("Invalid cart data");
    error.statusCode = 400;
    error.failureCode = "invalid_payload";
    throw error;
  }

  const attributes = cartData.attributes ?? {};
  const selectedValue = attributes[ENSHIELD_PROTECTION_ATTRIBUTE];
  const insuranceSelected =
    selectedValue === "true" || selectedValue === true;
  if (!insuranceSelected) return;
  const settings = await api.shippingInsuranceSetting.findMany({
    filter: {
      shopId: { equals: shopId },
      status: { equals: "active" },
    },
    select: {
      basePercentage: true,
      baseAmount: true,
      currency: true,
      pricingVersion: true,
      effectiveAt: true,
    },
    first: 250,
  });
  if (settings.length === 0) return;
  if (settings.hasNextPage) {
    const error = new Error("Protection pricing set is too large to select safely");
    error.failureCode = "pricing_truncated";
    throw error;
  }

  const product = await api.shippingInsuranceProduct.findFirst({
    filter: { shopId: { equals: shopId } },
    select: { productId: true, productGid: true },
  });
  if (!product) return;

  const currency = String(cartData.currency || "USD").toUpperCase();
  const pricing = selectProtectionPricing(settings);
  if (currency !== pricing.currency || String(shopCurrency ?? "").toUpperCase() !== pricing.currency) {
    const error = new Error("Cart currency does not match protection pricing");
    error.statusCode = 400;
    error.failureCode = "pricing_currency_mismatch";
    throw error;
  }
  const priced = calculateProtectionPrice({
    orderAmountMinor: Number(cartData.total_price),
    percentage: pricing.percentage,
    baseAmount: pricing.baseAmount,
    currency: pricing.currency,
  });
  const price = formatMinorAmount(priced.amountMinor, priced.minorUnit);
  const productGid =
    product.productGid || `gid://shopify/Product/${product.productId}`;
  const shopify = await connections.shopify.forShopId(shopId);
  const query = await shopify.graphql(
    `query($id: ID!) {
      product(id: $id) {
        variants(first: 100) {
          edges { node { id price inventoryPolicy } }
        }
      }
    }`,
    { id: productGid }
  );
  const existing = query.product?.variants?.edges?.some(
    ({ node }) => node.price === price
  );
  if (!existing) {
    const result = await shopify.graphql(
      `mutation productVariantCreate($productId: ID!, $price: String!) {
        productVariantCreate(input: {
          productId: $productId
          price: $price
          inventoryPolicy: CONTINUE
        }) {
          productVariant { id legacyResourceId price inventoryPolicy }
          userErrors { field message }
        }
      }`,
      { productId: productGid, price }
    );
    if (result.productVariantCreate?.userErrors?.length) {
      const error = new Error("Shopify rejected insurance variant");
      error.failureCode = "shopify_variant_rejected";
      throw error;
    }
  }
}

const route = async ({ request, reply, logger, api, connections, config = {} }) => {
  const hmac = header(request, "x-shopify-hmac-sha256");
  const shopDomain = normalizeShopDomain(
    header(request, "x-shopify-shop-domain")
  );
  const topic = normalizeWebhookTopic(header(request, "x-shopify-topic"));
  const webhookId = header(request, "x-shopify-webhook-id");
  const secret = config.SHOPIFY_API_SECRET || process.env.SHOPIFY_API_SECRET;

  if (!secret) {
    logger.error({ code: "webhook_secret_unavailable" }, "Webhook configuration unavailable");
    return reply.code(503).send({ error: "Webhook verification unavailable" });
  }
  if (request.rawBody === undefined || request.rawBody === null) {
    logger.warn({ code: "raw_body_unavailable" }, "Webhook raw body unavailable");
    return reply.code(400).send({ error: "Raw request body required" });
  }
  if (!verifyShopifyWebhook(request.rawBody, hmac, secret)) {
    logger.warn({ code: "invalid_webhook_signature" }, "Webhook authentication failed");
    return reply.code(401).send({ error: "Unauthorized" });
  }
  if (!topic) {
    logger.warn({ code: "unexpected_webhook_topic" }, "Webhook topic rejected");
    return reply.code(400).send({ error: "Unexpected webhook topic" });
  }
  if (!shopDomain) {
    logger.warn({ code: "invalid_shop_domain" }, "Webhook shop rejected");
    return reply.code(401).send({ error: "Unauthorized shop" });
  }
  const shops = await api.shopifyShop.findMany({
    filter: { domain: { equals: shopDomain } },
    select: { id: true, currency: true },
    first: 1,
  });
  if (shops.length !== 1) {
    logger.warn({ code: "unregistered_shop" }, "Webhook shop rejected");
    return reply.code(401).send({ error: "Unauthorized shop" });
  }
  const shopId = shops[0].id;

  const deliveryKey = buildWebhookDeliveryKey({
    webhookId,
  });
  if (!deliveryKey) {
    logger.warn({ code: "invalid_webhook_id" }, "Webhook ID rejected");
    return reply.code(400).send({ error: "Valid webhook ID required" });
  }
  const logId = safeDeliveryLogId(deliveryKey);
  const now = new Date();
  const currentShopHash = shopDomainHash(shopDomain);
  let receipt;
  try {
    receipt = await api.webhookReceipt.create({
      deliveryKey,
      topic,
      shopDomainHash: currentShopHash,
      status: "processing",
    });
  } catch (error) {
    if (!hasDeliveryKeyUniqueViolation(error)) {
      logger.error({ delivery: logId, code: "receipt_persistence_failed" }, "Webhook receipt persistence failed");
      return reply.code(503).send({ error: "Webhook temporarily unavailable" });
    }
    receipt = await api.webhookReceipt.findFirst({
      filter: { deliveryKey: { equals: deliveryKey } },
      select: { id: true, topic: true, shopDomainHash: true },
    });
    if (!receipt) {
      logger.error({ delivery: logId, code: "duplicate_receipt_missing" }, "Webhook receipt lookup failed");
      return reply.code(503).send({ error: "Webhook temporarily unavailable" });
    }
    if (
      receipt.topic !== topic
      || !constantTimeHexEqual(receipt.shopDomainHash, currentShopHash)
    ) {
      logger.warn({ delivery: logId, code: "receipt_binding_mismatch" }, "Webhook receipt binding rejected");
      return reply.code(409).send({ error: "Webhook delivery binding mismatch" });
    }
  }

  let attemptClaim;
  try {
    attemptClaim = await acquireWebhookAttempt(api, deliveryKey, { now });
  } catch {
    logger.error({ delivery: logId, code: "attempt_persistence_failed" }, "Webhook attempt persistence failed");
    return reply.code(503).send({ error: "Webhook temporarily unavailable" });
  }
  if (!attemptClaim.acquired) {
    if (attemptClaim.reason === "processed") {
      return reply.code(200).send({ received: true, duplicate: true });
    }
    return reply.code(409).send({ received: false, processing: true });
  }
  const attempt = attemptClaim.attempt;

  try {
    await processCartUpdate({
      cartData: request.body,
      shopId,
      shopCurrency: shops[0].currency,
      api,
      connections,
    });
    await api.webhookAttempt.update(attempt.id, {
      status: "processed",
      leaseExpiresAt: new Date().toISOString(),
    });
    try {
      await api.webhookReceipt.update(receipt.id, {
        status: "processed",
        processedAt: new Date().toISOString(),
      });
    } catch {
      logger.warn({ delivery: logId, code: "receipt_projection_failed" }, "Webhook receipt projection update failed");
    }
    logger.info({ delivery: logId, topic }, "Webhook processed");
    return reply.code(200).send({ received: true });
  } catch (error) {
    const failureCode = error.failureCode || "processing_failed";
    try {
      await api.webhookAttempt.update(attempt.id, {
        status: "failed",
        failureCode,
        leaseExpiresAt: new Date().toISOString(),
      });
      try {
        await api.webhookReceipt.update(receipt.id, {
          status: "failed",
          failureCode,
        });
      } catch {}
    } catch {
      logger.error({ delivery: logId, code: "receipt_update_failed" }, "Webhook failure receipt update failed");
    }
    logger.error({ delivery: logId, code: failureCode }, "Webhook processing failed");
    return reply
      .code(error.statusCode || 500)
      .send({ error: error.statusCode === 400 ? "Invalid cart data" : "Internal server error" });
  }
};

route.options = {
  cors: { origin: false },
};

export default route;
