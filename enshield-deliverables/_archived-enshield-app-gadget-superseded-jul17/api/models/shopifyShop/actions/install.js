import { applyParams, save, ActionOptions } from "gadget-server";

/** @type { ActionRun } */
export const run = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await save(record);
};

/** @type { ActionOnSuccess } */
export const onSuccess = async ({ params, record, logger, api, connections, currentAppUrl }) => {
  logger.info({ shopId: record.id }, "Shop installed, creating shipping insurance product");

  // Set Gadget API URL from environment variable as shop metafield
  try {
    const shopify = await connections.shopify.forShopId(record.id);
    const shopGid = `gid://shopify/Shop/${record.id}`;
    const gadgetApiUrl = process.env.GADGET_API_URL || currentAppUrl;
    
    const metafieldResult = await shopify.graphql(`
      mutation SetGadgetApiUrl($metafields: [MetafieldsSetInput!]!) {
        metafieldsSet(metafields: $metafields) {
          metafields {
            id
            namespace
            key
            value
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      metafields: [
        {
          ownerId: shopGid,
          namespace: 'enshield',
          key: 'gadget_api_url',
          type: 'single_line_text_field',
          value: gadgetApiUrl
        }
      ]
    });
    
    if (metafieldResult.metafieldsSet?.userErrors?.length > 0) {
      logger.error({ shopId: record.id, errors: metafieldResult.metafieldsSet.userErrors }, 'Failed to set Gadget API URL metafield');
    } else {
      logger.info({ shopId: record.id, gadgetApiUrl }, 'Set Gadget API URL metafield on shop');
    }
  } catch (error) {
    logger.error({ shopId: record.id, error: error.message }, 'Error setting Gadget API URL metafield');
  }

  await api.enqueue(api.setupShippingInsuranceProduct, { shopId: record.id });
};
//    await api.enqueue(api.setupShippingInsuranceProduct, { shopId: record.id });


/** @type { ActionOptions } */
export const options = { actionType: "create" };
