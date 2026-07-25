import { applyParams, save } from "gadget-server";
import { assignmentKeyFor, requireOwnerProvisioning } from "../../../lib/operatorProvisioning.js";

export const run = async ({ params, record, api, trigger }) => {
  requireOwnerProvisioning({ trigger });
  const input = params?.operatorShopAssignment || {};
  const operatorId = input.operator?._link ?? input.operator;
  const shopId = input.shop?._link ?? input.shop;
  const roleId = input.role?._link ?? input.role;
  const assignmentKey = assignmentKeyFor(operatorId, shopId);
  const [operator, shop, role, duplicate] = await Promise.all([
    api.internalOperator.findFirst({ filter: { AND: [{ id: { equals: operatorId } }, { status: { equals: "active" } }] }, select: { id: true } }),
    api.shopifyShop.findFirst({ filter: { id: { equals: shopId } }, select: { id: true } }),
    api.appRole.findFirst({ filter: { id: { equals: roleId } }, select: { id: true, name: true } }),
    api.operatorShopAssignment.maybeFindFirst({ filter: { assignmentKey: { equals: assignmentKey } }, select: { id: true } }),
  ]);
  if (!operator || !shop || !role || duplicate) {
    const error = new Error(duplicate ? "Duplicate operator shop assignment" : "Invalid provisioning relationship");
    error.statusCode = duplicate ? 409 : 400;
    throw error;
  }
  applyParams({ operatorShopAssignment: {
    ...input, assignmentKey,
    operator: { _link: operatorId }, shop: { _link: shopId }, role: { _link: roleId },
  } }, record);
  await save(record);
};
export const options = { actionType: "create" };
