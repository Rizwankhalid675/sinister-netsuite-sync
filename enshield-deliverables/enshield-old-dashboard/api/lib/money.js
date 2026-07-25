// Money-bag parsing for Shopify *Set fields — single source of truth.
// Imported by: GET-dashboard-metrics route and any future reporting/finance
// code. Keep money coercion here so the fallback chain stays consistent.

/**
 * Parse a Shopify money-bag field into a finite Number.
 *
 * Shopify *Set money fields look like:
 *   { shopMoney: { amount, currencyCode }, presentmentMoney: { amount, ... } }
 *
 * We prefer shopMoney (the store's own currency — what the merchant's totals
 * are denominated in), fall back to presentmentMoney, then 0. A non-finite or
 * missing amount always yields 0 so downstream sums never become NaN.
 *
 * @param {any} set - a Shopify money-bag set field (may be null/undefined)
 * @returns {number} finite amount, 0 on missing/invalid
 */
export function money(set) {
  const bag = set?.shopMoney ?? set?.shop_money ?? set?.presentmentMoney ?? set?.presentment_money;
  const amt = bag?.amount ?? 0;
  const n = Number(amt);
  return Number.isFinite(n) ? n : 0;
}

/**
 * The currency code for a money-bag set, preferring shopMoney. Null if absent.
 * Handles both camelCase (shopMoney/currencyCode) and snake_case
 * (shop_money/currency_code) shapes — some legacy/webhook-sourced order
 * records store the raw Shopify REST snake_case keys instead of the
 * GraphQL camelCase ones.
 * @param {any} set
 * @returns {string|null}
 */
export function currencyOf(set) {
  const bag = set?.shopMoney ?? set?.shop_money ?? set?.presentmentMoney ?? set?.presentment_money;
  return bag?.currencyCode ?? bag?.currency_code ?? null;
}

/**
 * Percentage helper: (num/den)*100, guarded against divide-by-zero.
 * Returns 0 when den <= 0 (no basis to compute a rate).
 * @param {number} num
 * @param {number} den
 * @returns {number}
 */
export function pct(num, den) {
  return den > 0 ? (num / den) * 100 : 0;
}

/**
 * Period-over-period delta as a percentage: ((cur-prev)/prev)*100.
 * Returns null (not 0) when prev <= 0, so callers can distinguish "no prior
 * basis to compare" from "0% change".
 * @param {number} cur
 * @param {number} prev
 * @returns {number|null}
 */
export function delta(cur, prev) {
  return prev > 0 ? ((cur - prev) / prev) * 100 : null;
}
