import { applyParams, save } from "gadget-server";
import { requireOwnerProvisioning } from "../../../lib/operatorProvisioning.js";

export const run = async ({ params, record, trigger }) => {
  requireOwnerProvisioning({ trigger });
  const input = params?.operatorShopAssignment || {};
  if (input.assignmentKey || input.operator || input.shop) {
    const error = new Error("Assignment identity is immutable");
    error.statusCode = 400;
    throw error;
  }
  applyParams({ operatorShopAssignment: input }, record);
  await save(record);
};
export const options = { actionType: "update" };
