import { PERMISSIONS } from "../permissions.js";
import { requireInternalAccess } from "../internalAccess.js";

export async function requireFinanceRouteAccess(
  { api, session },
  body,
  permission = PERMISSIONS.EDIT_FINANCE
) {
  const shopId = body?.shopId;
  const accountingEntityId = body?.accountingEntityId;
  if (!shopId || !accountingEntityId) {
    const error = new Error("shopId and accountingEntityId are required");
    error.statusCode = 400;
    throw error;
  }
  const access = await requireInternalAccess(
    { api, session },
    permission,
    shopId
  );
  const entity = await api.accountingEntity.findFirst({
    filter: {
      AND: [
        { id: { equals: String(accountingEntityId) } },
        { shopId: { equals: String(access.shopIds[0]) } },
      ],
    },
    select: { id: true, shopId: true },
  });
  if (!entity) {
    const error = new Error("Forbidden");
    error.statusCode = 403;
    throw error;
  }
  return { access, entity };
}

export async function sendFinanceRouteError({ reply, logger }, error, operation) {
  logger.error(
    { errorName: error?.name, statusCode: error?.statusCode, operation },
    "Finance API request failed"
  );
  const statusCode = [400, 401, 403, 404, 409, 503].includes(error?.statusCode)
    ? error.statusCode
    : 500;
  await reply.code(statusCode).send({
    success: false,
    error: statusCode === 500 ? "Internal server error" : error.message,
  });
}
