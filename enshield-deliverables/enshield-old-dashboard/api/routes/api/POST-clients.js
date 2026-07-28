// Create a new client from the dashboard "Add client" button.
// Normally a client links to an existing shopifyShop (picker populated by
// GET-clients-shop-options). Callers with a global role (Super Admin /
// Administrator — see GLOBAL_LEGACY_ROLES in lib/internalAccess.js) may
// instead pass `legacyImport: true` with no shopId to create a shop-less
// "legacy" record (e.g. backfilled from the old dashboard for a store not
// yet installed in this app). Legacy records are only ever visible to
// those same global roles — see shopIdFilter's includesLegacy behavior.
import { PERMISSIONS, requirePermission } from "../../lib/permissions.js";

const STATUSES = new Set(["active", "paused", "onboarding", "churned"]);

const route = async ({ request, reply, api, logger, session }) => {
  try {
    await requirePermission({ api, session }, PERMISSIONS.EDIT_CLIENTS);

    const body = request.body || {};
    const shopId = typeof body.shopId === "string" ? body.shopId.trim() : "";
    const legacyImport = body.legacyImport === true;
    const storeName = typeof body.storeName === "string" ? body.storeName.trim() : "";
    const storeId = typeof body.storeId === "string" ? body.storeId.trim() : "";
    const plan = typeof body.plan === "string" ? body.plan.trim() : "";
    const status = STATUSES.has(body.status) ? body.status : "onboarding";
    const legacyStoreId = typeof body.legacyStoreId === "string" ? body.legacyStoreId.trim() : "";
    const createdByEmail = typeof body.createdByEmail === "string" ? body.createdByEmail.trim() : "";
    const apiEnabled = body.apiEnabled === true;
    const customerSince = typeof body.customerSince === "string" ? body.customerSince.trim() : "";

    if (!shopId && !legacyImport) {
      return reply.code(400).send({ success: false, error: "shopId is required" });
    }
    if (!storeName) return reply.code(400).send({ success: false, error: "storeName is required" });
    if (!storeId) return reply.code(400).send({ success: false, error: "storeId is required" });

    if (shopId) {
      const existing = await api.client.maybeFindFirst({
        filter: { shop: { id: { equals: shopId } } },
        select: { id: true },
      });
      if (existing) {
        return reply.code(409).send({ success: false, error: "A client already exists for this store" });
      }
    }

    const record = await api.client.create({
      ...(shopId ? { shop: { _link: shopId } } : {}),
      storeId,
      storeName,
      plan: plan || undefined,
      status,
      ...(legacyStoreId ? { legacyStoreId } : {}),
      ...(createdByEmail ? { createdByEmail } : {}),
      ...(apiEnabled ? { apiEnabled } : {}),
      ...(customerSince ? { customerSince } : {}),
    });

    await reply.code(201).send({ success: true, client: record });
  } catch (error) {
    logger.error({ errorName: error?.name, statusCode: error?.statusCode }, "Error creating client");
    const statusCode = [400, 401, 403, 409].includes(error?.statusCode) ? error.statusCode : 500;
    await reply.code(statusCode).send({
      success: false,
      error: statusCode === 500 ? "Internal server error while creating client" : error.message,
    });
  }
};
export default route;
