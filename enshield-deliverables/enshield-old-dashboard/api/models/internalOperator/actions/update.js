import { applyParams, save } from "gadget-server";
import { requireOwnerProvisioning } from "../../../lib/operatorProvisioning.js";

export const run = async ({ params, record, trigger }) => {
  requireOwnerProvisioning({ trigger });
  const input = params?.internalOperator || {};
  if (input.personId && input.personId !== record.personId) {
    const error = new Error("Operator person identity is immutable");
    error.statusCode = 400;
    throw error;
  }
  applyParams({ internalOperator: { ...input, personId: record.personId } }, record);
  await save(record);
};
export const options = { actionType: "update" };
