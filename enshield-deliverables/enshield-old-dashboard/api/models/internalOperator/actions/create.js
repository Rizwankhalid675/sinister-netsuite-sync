import { applyParams, save } from "gadget-server";
import { requireOwnerProvisioning } from "../../../lib/operatorProvisioning.js";

export const run = async ({ params, record, trigger }) => {
  requireOwnerProvisioning({ trigger });
  const input = params?.internalOperator || {};
  if (typeof input.personId !== "string" || !/^[A-Za-z0-9._|~:@/-]{1,200}$/.test(input.personId)) {
    const error = new Error("Invalid operator person identity");
    error.statusCode = 400;
    throw error;
  }
  applyParams({ internalOperator: input }, record);
  await save(record);
};
export const options = { actionType: "create" };
