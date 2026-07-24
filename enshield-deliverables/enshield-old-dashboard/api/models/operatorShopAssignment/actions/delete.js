import { save } from "gadget-server";
import { requireOwnerProvisioning } from "../../../lib/operatorProvisioning.js";

export const run = async ({ record, trigger }) => {
  requireOwnerProvisioning({ trigger });
  record.status = "revoked";
  await save(record);
};
export const options = { actionType: "delete" };
