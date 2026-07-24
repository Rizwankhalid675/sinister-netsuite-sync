import { applyParams, save } from "gadget-server";

/** @type { ActionRun } */
export const run = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await save(record);
};

/** @type { ActionOnSuccess } */
export const onSuccess = async ({ params, record, logger, api, connections }) => {
  logger.info({ shopId: record.id }, "Shop installed, creating shipping insurance product");

  await api.enqueue(api.setupShippingInsuranceProduct, { shopId: record.id });
};
//    await api.enqueue(api.setupShippingInsuranceProduct, { shopId: record.id });


/** @type { ActionOptions } */
export const options = { actionType: "create" };
