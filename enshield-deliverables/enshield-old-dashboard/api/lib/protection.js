export const ENSHIELD_PROTECTION_ATTRIBUTE = "shippingInsurance";

const MINOR_UNITS = Object.freeze({
  BHD: 3,
  BIF: 0,
  CLP: 0,
  CLF: 4,
  DJF: 0,
  GNF: 0,
  IQD: 3,
  ISK: 0,
  JOD: 3,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  PYG: 0,
  RWF: 0,
  TND: 3,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
});

export const minorUnitForCurrency = (currency) =>
  MINOR_UNITS[String(currency ?? "").toUpperCase()] ?? 2;

const truthValue = (value) =>
  value === true || (typeof value === "string" && value.trim().toLowerCase() === "true");

/**
 * Protection is proven only by Enshield's canonical order attribute.
 * Shopify's unrelated `shopifyProtect` signal is intentionally ignored.
 * Duplicate canonical markers must agree; conflicts fail closed.
 */
export function hasEnshieldProtection(order) {
  const markers = [];
  for (const attribute of attributeArray(order?.noteAttributes)) {
    if (attribute?.name === ENSHIELD_PROTECTION_ATTRIBUTE) markers.push(attribute.value);
  }
  for (const attribute of attributeArray(order?.customAttributes)) {
    if (attribute?.key === ENSHIELD_PROTECTION_ATTRIBUTE) markers.push(attribute.value);
  }
  if (
    order?.attributes
    && Object.prototype.hasOwnProperty.call(order.attributes, ENSHIELD_PROTECTION_ATTRIBUTE)
  ) {
    markers.push(order.attributes[ENSHIELD_PROTECTION_ATTRIBUTE]);
  }
  return markers.length > 0 && markers.every(truthValue);
}

export function isProtectionEligible(order) {
  if (!hasEnshieldProtection(order) || order?.cancelledAt) return false;
  if (order?.financialStatus === "refunded" || order?.financialStatus === "voided") {
    return false;
  }
  const refundedBag = parseMoneyBag(order?.totalRefundedSet);
  const grossBag =
    parseMoneyBag(order?.originalTotalPriceSet)
    ?? parseMoneyBag(order?.currentTotalPriceSet);
  if (!refundedBag) return order?.totalRefundedSet == null;
  if (!grossBag || refundedBag.currency !== grossBag.currency) return false;
  return refundedBag.amountMinor < grossBag.amountMinor;
}

function decimalFraction(value, label) {
  const normalized = String(value ?? "0").trim();
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new TypeError(`Invalid ${label}`);
  }
  const [whole, fraction = ""] = normalized.split(".");
  if (fraction.length > 9) throw new RangeError(`Invalid ${label}: too many decimals`);
  const denominator = 10n ** BigInt(fraction.length);
  return {
    numerator: BigInt(whole) * denominator + BigInt(fraction || "0"),
    denominator,
  };
}

const roundHalfUp = (numerator, denominator) =>
  (numerator * 2n + denominator) / (denominator * 2n);

/**
 * Calculate `(order amount * percentage / 100) + base amount` without
 * binary floating-point arithmetic. Inputs/outputs use the currency's minor
 * unit; percentage and baseAmount accept decimal strings or numbers.
 */
export function calculateProtectionPrice({
  orderAmountMinor,
  percentage = "0",
  baseAmount = "0",
  currency,
}) {
  if (!Number.isSafeInteger(orderAmountMinor)) {
    throw new RangeError("orderAmountMinor must be a safe integer");
  }
  if (orderAmountMinor < 0) throw new RangeError("negative order amount is invalid");

  const currencyCode = String(currency ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currencyCode)) throw new TypeError("Invalid currency");
  const minorUnit = minorUnitForCurrency(currencyCode);
  const pct = decimalFraction(percentage, "percentage");
  const base = decimalFraction(baseAmount, "base amount");

  const pctDenominator = pct.denominator * 100n;
  const baseMultiplier = 10n ** BigInt(minorUnit);
  const commonDenominator = pctDenominator * base.denominator;
  const numerator =
    BigInt(orderAmountMinor) * pct.numerator * base.denominator
    + base.numerator * baseMultiplier * pctDenominator;
  const amount = roundHalfUp(numerator, commonDenominator);
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new RangeError("calculated amount exceeds safe integer range");
  }
  return { amountMinor: Number(amount), currency: currencyCode, minorUnit };
}

export function majorToMinor(amount, currency) {
  const currencyCode = String(currency ?? "").trim().toUpperCase();
  const minorUnit = minorUnitForCurrency(currencyCode);
  const decimal = decimalFraction(amount, "amount");
  const multiplier = 10n ** BigInt(minorUnit);
  const rounded = roundHalfUp(decimal.numerator * multiplier, decimal.denominator);
  if (rounded > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError("amount exceeds safe range");
  return Number(rounded);
}

export function formatMinorAmount(amountMinor, minorUnit = 2) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) {
    throw new RangeError("amountMinor must be a non-negative safe integer");
  }
  const divisor = 10 ** minorUnit;
  if (minorUnit === 0) return String(amountMinor);
  return `${Math.floor(amountMinor / divisor)}.${String(amountMinor % divisor).padStart(minorUnit, "0")}`;
}

function parseMoneyBag(bag) {
  if (bag == null) return null;
  // Some legacy/webhook-sourced order records store the raw Shopify REST
  // snake_case keys (shop_money/currency_code) instead of the GraphQL
  // camelCase ones (shopMoney/currencyCode) — accept both shapes.
  const money = bag.shopMoney ?? bag.shop_money ?? bag.presentmentMoney ?? bag.presentment_money;
  const currencyCode = money?.currencyCode ?? money?.currency_code;
  if (!money || typeof currencyCode !== "string") return null;
  try {
    return {
      amountMinor: majorToMinor(money.amount, currencyCode),
      currency: currencyCode.toUpperCase(),
    };
  } catch {
    return null;
  }
}

export function loadProtectionPricing(setting, at = new Date()) {
  const effective = new Date(setting?.effectiveAt);
  const version = String(setting?.pricingVersion ?? "").trim();
  const currency = String(setting?.currency ?? "").trim().toUpperCase();
  try {
    decimalFraction(setting?.basePercentage, "pricing percentage");
    decimalFraction(setting?.baseAmount, "pricing base amount");
  } catch {
    throw new Error("Invalid protection pricing configuration");
  }
  if (!version || !/^[A-Z]{3}$/.test(currency) || !Number.isFinite(effective.getTime())) {
    throw new Error("Invalid protection pricing configuration");
  }
  if (effective.getTime() > at.getTime()) throw new Error("Protection pricing is not effective");
  return {
    percentage: String(setting.basePercentage),
    baseAmount: String(setting.baseAmount),
    currency,
    version,
    effectiveAt: effective.toISOString(),
  };
}

export function getProtectionPriceSnapshot(order) {
  const amountMinor = order?.enshieldProtectionAmountMinor;
  const currency = String(order?.enshieldProtectionCurrency ?? "").toUpperCase();
  const version = String(order?.enshieldPricingVersion ?? "").trim();
  const orderCurrency = String(order?.currency ?? currency).toUpperCase();
  if (
    Number.isSafeInteger(amountMinor)
    && amountMinor >= 0
    && /^[A-Z]{3}$/.test(currency)
    && version
    && orderCurrency === currency
  ) {
    return { amountMinor, currency, version };
  }
  // Legacy fallback: older/seeded orders never had the canonical
  // enshieldProtectionAmountMinor/Currency/PricingVersion fields backfilled,
  // but do carry the pre-canonical `shippingInsuranceCost` note attribute
  // (a major-unit decimal). Only used when the strict canonical snapshot
  // above is unavailable — new orders always populate the canonical fields.
  return legacyProtectionPriceSnapshot(order);
}

function legacyProtectionPriceSnapshot(order) {
  let raw;
  for (const attribute of attributeArray(order?.noteAttributes)) {
    if (attribute?.name === "shippingInsuranceCost") raw = attribute.value;
  }
  if (raw === undefined) return null;
  const legacyCurrency = String(order?.currency ?? "USD").toUpperCase();
  if (!/^[A-Z]{3}$/.test(legacyCurrency)) return null;
  try {
    const amountMinor = majorToMinor(raw, legacyCurrency);
    if (!Number.isSafeInteger(amountMinor) || amountMinor < 0) return null;
    return { amountMinor, currency: legacyCurrency, version: "legacy" };
  } catch {
    return null;
  }
}

export function selectExactVariant(edges, amountMinor, currency) {
  const targetCurrency = String(currency ?? "").toUpperCase();
  for (const edge of edges ?? []) {
    const node = edge?.node;
    if (String(node?.currencyCode ?? "").toUpperCase() !== targetCurrency) continue;
    try {
      if (majorToMinor(node.price, targetCurrency) === amountMinor) return edge;
    } catch {}
  }
  return null;
}

export function selectProtectionPricing(rows, eventAt = new Date()) {
  const eligible = (rows ?? [])
    .filter((row) => row?.status === "active")
    .filter((row) => {
      const effective = new Date(row?.effectiveAt).getTime();
      return Number.isFinite(effective) && effective <= eventAt.getTime();
    })
    .map((row) => ({ row, parsed: loadProtectionPricing(row, eventAt) }))
    .sort((a, b) => {
      const time = new Date(b.parsed.effectiveAt) - new Date(a.parsed.effectiveAt);
      return time || a.parsed.version.localeCompare(b.parsed.version);
    });
  if (eligible.length === 0) throw new Error("No effective protection pricing");
  if (
    eligible[1]
    && eligible[1].parsed.effectiveAt === eligible[0].parsed.effectiveAt
  ) throw new Error("Ambiguous protection pricing");
  return eligible[0].parsed;
}

const SNAPSHOT_FIELDS = [
  "enshieldProtectionAmountMinor",
  "enshieldProtectionCurrency",
  "enshieldPricingVersion",
];

export function assertProtectionSnapshotImmutable(existing, proposed) {
  const existingValues = SNAPSHOT_FIELDS.map((field) => existing?.[field]);
  const proposedValues = SNAPSHOT_FIELDS.map((field) => proposed?.[field]);
  const existingCount = existingValues.filter((value) => value != null).length;
  const proposedCount = proposedValues.filter((value) => value != null).length;
  if (![0, SNAPSHOT_FIELDS.length].includes(existingCount)
    || ![0, SNAPSHOT_FIELDS.length].includes(proposedCount)) {
    throw new Error("Protection snapshot fields must be all-or-none");
  }
  if (existingCount === SNAPSHOT_FIELDS.length) {
    const unchanged = SNAPSHOT_FIELDS.every(
      (field) => proposed?.[field] === undefined || proposed[field] === existing[field]
    );
    if (!unchanged) throw new Error("Protection snapshot is immutable");
  }
}

export function buildChargedProtectionSnapshot({
  lineItems,
  trustedVariantId,
  pricing,
}) {
  if (!trustedVariantId || !pricing?.version || !pricing?.currency) return null;
  const matches = (lineItems ?? []).filter(
    (item) => String(item?.variantId) === String(trustedVariantId)
  );
  if (matches.length !== 1) return null;
  const item = matches[0];
  if (String(item.currency ?? "").toUpperCase() !== pricing.currency) return null;
  let amountMinor;
  try {
    amountMinor = majorToMinor(item.chargedAmount, pricing.currency);
  } catch {
    return null;
  }
  return {
    enshieldProtectionAmountMinor: amountMinor,
    enshieldProtectionCurrency: pricing.currency,
    enshieldPricingVersion: pricing.version,
  };
}
const attributeArray = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};
