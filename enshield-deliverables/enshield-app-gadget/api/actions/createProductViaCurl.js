/** @type { ActionRun } */
export const run = async ({ params, logger, api, connections }) => {
  const { shopId } = params;

  logger.info({ shopId }, "Creating shipping insurance product via Shopify REST API");

  // Fetch the shop record to get access token and domain
  const shop = await api.shopifyShop.findOne(shopId, {
    select: {
      id: true,
      myshopifyDomain: true,
      accessToken: true
    }
  });

  if (!shop) {
    throw new Error(`Shop with ID ${shopId} not found`);
  }

  if (!shop.accessToken) {
    throw new Error(`Shop ${shopId} does not have an access token`);
  }

  // Construct the product payload
  const productData = {
    product: {
      title: "Shipping Insurance",
      handle: "shipping-insurance",
      product_type: "Service",
      vendor: "Enshield",
      status: "active",
      variants: [
        {
          price: "0.01",
          taxable: false
        }
      ]
    }
  };

  // Prepare the API request
  const apiUrl = `https://${shop.myshopifyDomain}/admin/api/2026-01/products.json`;
  const requestHeaders = {
    "X-Shopify-Access-Token": shop.accessToken,
    "Content-Type": "application/json"
  };

  logger.info({ url: apiUrl, payload: productData }, "Sending product creation request to Shopify");

  try {
    // Make the POST request to create the product
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: requestHeaders,
      body: JSON.stringify(productData)
    });

    const responseText = await response.text();
    logger.info({ status: response.status, statusText: response.statusText, body: responseText }, "Received response from Shopify");

    if (!response.ok) {
      throw new Error(`Shopify API request failed: ${response.status} ${response.statusText} - ${responseText}`);
    }

    const result = JSON.parse(responseText);
    
    if (!result.product) {
      throw new Error("Unexpected response format: product not found in response");
    }

    const productId = result.product.id;
    const variantId = result.product.variants?.[0]?.id;

    logger.info({ productId, variantId }, "Successfully created shipping insurance product");

    return {
      productId: productId?.toString(),
      variantId: variantId?.toString(),
      product: result.product
    };

  } catch (error) {
    logger.error({ error: error.message, stack: error.stack, shopId }, "Failed to create shipping insurance product");
    throw error;
  }
};

export const params = {
  shopId: { type: "string" }
};
