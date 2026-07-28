/**
 * Backfill "client" records (one per shop) from existing shopifyShop
 * records. The client model comment claims this exists; it never did.
 * Idempotent — safe to run multiple times, skips shops that already
 * have a client record.
 */
export const run = async ({ api, logger }) => {
  const shops = await api.shopifyShop.findMany({ select: { id: true, domain: true, name: true } });
  if (!shops.length) {
    logger.warn("No shopifyShop records found; nothing to backfill.");
    return { success: true, results: [] };
  }

  const results = [];
  for (const shop of shops) {
    const existing = await api.client.maybeFindFirst({
      filter: { shop: { id: { equals: shop.id } } },
      select: { id: true },
    });
    if (existing) {
      results.push({ shopId: shop.id, domain: shop.domain, action: "skipped" });
      continue;
    }

    await api.client.create({
      shop: { _link: shop.id },
      storeId: shop.id,
      storeName: shop.name || shop.domain || shop.id,
      status: "active",
    });
    results.push({ shopId: shop.id, domain: shop.domain, action: "created" });
  }

  logger.info({ results }, "Backfilled client records from shopifyShop");
  return { success: true, results };
};

export const options = {
  triggers: { api: true },
};
