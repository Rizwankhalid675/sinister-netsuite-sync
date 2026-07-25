import { applyParams, save, ActionOptions } from "gadget-server";
import { preventCrossShopDataAccess } from "gadget-server/shopify";

/** @type { ActionRun } */
export const run = async ({ params, record, logger, api, connections }) => {
  applyParams(params, record);
  await preventCrossShopDataAccess(params, record);
  await save(record);
};

/** @type { ActionOnSuccess } */
export const onSuccess = async ({ params, record, logger, api, connections }) => {
  // Check if the product title contains 'Shipping Insurance'
  if (record.title && record.title.toLowerCase().includes('shipping insurance')) {
    logger.info({ productId: record.id }, "Detected Shipping Insurance product");
    
    // Fetch the variants for this product
    const variants = await api.shopifyProductVariant.findMany({
      filter: { productId: { equals: record.id } },
      first: 1,
      select: { id: true }
    });
    
    if (variants.length === 0) {
      logger.warn({ productId: record.id }, "No variants found for Shipping Insurance product");
      return;
    }
    
    const firstVariant = variants[0];
    const productGid = `gid://shopify/Product/${record.id}`;
    const variantGid = `gid://shopify/ProductVariant/${firstVariant.id}`;
    
    // Check if a shippingInsuranceProduct record already exists for this shop
    const existingRecord = await api.shippingInsuranceProduct.maybeFindFirst({
      filter: { shopId: { equals: record.shopId } }
    });
    
    if (existingRecord) {
      logger.info({ existingRecordId: existingRecord.id, shopId: record.shopId }, "Updating existing shippingInsuranceProduct record");
      await api.shippingInsuranceProduct.update(existingRecord.id, {
        productId: record.id,
        productGid: productGid,
        variantId: firstVariant.id,
        variantGid: variantGid
      });
      logger.info({ recordId: existingRecord.id }, "Updated shippingInsuranceProduct record");
    } else {
      logger.info({ shopId: record.shopId }, "Creating new shippingInsuranceProduct record");
      const newRecord = await api.shippingInsuranceProduct.create({
        productId: record.id,
        productGid: productGid,
        shop: { _link: record.shopId },
        variantId: firstVariant.id,
        variantGid: variantGid
      });
      logger.info({ recordId: newRecord.id }, "Created new shippingInsuranceProduct record");
    }
  }
};

/** @type { ActionOptions } */
export const options = { actionType: "create" };
