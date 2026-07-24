/** @type { ActionRun } */
export const run = async ({ params, logger, api, connections, config }) => {
  const { orderId, shopId } = params;

  // Validate required parameters
  if (!orderId || !shopId) {
    throw new Error("orderId and shopId are required parameters");
  }

  logger.info({ orderId, shopId }, "Fetching order from Shopify for Enshield submission");

  // Normalize the order ID - handle both numeric IDs and full GIDs
  let normalizedOrderId = orderId;
  if (!orderId.startsWith('gid://')) {
    // If it's just a numeric ID, convert it to a GID
    normalizedOrderId = `gid://shopify/Order/${orderId}`;
    logger.info({ originalOrderId: orderId, normalizedOrderId }, "Converted numeric order ID to GID format");
  }

  // Get Enshield API key from environment variables
  const apiKey = config.ENSHIELD_API_KEY;
  if (!apiKey) {
    throw new Error("ENSHIELD_API_KEY environment variable is not configured");
  }

  // Fetch order data directly from Shopify
  let order;
  try {
    const shopifyClient = await connections.shopify.forShopId(shopId);

    const response = await shopifyClient.graphql(
      `query getOrder($id: ID!) {
        order(id: $id) {
          id
          name
          email
          phone
          totalPriceSet {
            shopMoney {
              amount
            }
          }
          billingAddress {
            name
            firstName
            lastName
            address1
            address2
            city
            province
            provinceCode
            country
            countryCode
            zip
            phone
          }
          shippingAddress {
            name
            firstName
            lastName
            address1
            address2
            city
            province
            provinceCode
            country
            countryCode
            zip
            phone
          }
          customAttributes {
            key
            value
          }
          lineItems(first: 100) {
            edges {
              node {
                id
                name
                quantity
                sku
                originalUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
              }
            }
          }
        }
      }`,
      { id: normalizedOrderId }
    );

    order = response.order;

    if (!order) {
      logger.error({ orderId, normalizedOrderId, shopId }, "Order not found in Shopify");
      throw new Error(`Order ${orderId} not found in Shopify`);
    }

    logger.info({ orderId: order.id, orderName: order.name }, "Successfully fetched order from Shopify");
  } catch (error) {
    logger.error({ orderId, normalizedOrderId, shopId, error: error.message }, "Failed to fetch order from Shopify");
    throw new Error(`Failed to fetch order ${orderId} from Shopify: ${error.message}`);
  }

  // Check if shipping insurance was purchased from custom attributes
  const customAttributes = order.customAttributes || [];
  const hasInsurance = customAttributes.some(
    attr => attr.key === 'shippingInsurance' && attr.value === 'true'
  );

  if (!hasInsurance) {
    logger.info({ orderId }, "Order does not have shipping insurance, skipping Enshield submission");
    return { success: false, reason: "No shipping insurance purchased" };
  }

  // Extract customer information
  const billingAddress = order.billingAddress || {};
  const shippingAddress = order.shippingAddress || billingAddress;

  // Get customer name from billing address
  let customerName = billingAddress.name;
  if (!customerName && billingAddress.firstName) {
    customerName = `${billingAddress.firstName} ${billingAddress.lastName || ''}`.trim();
  }
  if (!customerName) {
    customerName = order.email || 'Unknown Customer';
  }

  // Format products array for Enshield
  const lineItems = order.lineItems?.edges || [];
  const products = lineItems.map(edge => {
    const item = edge.node;
    return {
      sku: item.sku || item.id || '0', // USE ID if sku doesn't exist
      name: item.name || '',
      items: item.quantity || 1,
      item_amount: item.originalUnitPriceSet?.shopMoney?.amount || '0'
    };
  });

  // Format order data for Enshield API
  const enshieldOrderData = {
    customer_name: customerName,
    customer_email: order.email || '',
    order_value: order.totalPriceSet?.shopMoney?.amount || '0',

    customer_address: shippingAddress.address1 || '',
    customer_address2: shippingAddress.address2 || '',
    customer_city: shippingAddress.city || '',
    customer_state: shippingAddress.province || shippingAddress.provinceCode || '',
    customer_country: shippingAddress.country || shippingAddress.countryCode || '',
    customer_zip: shippingAddress.zip || '',
    customer_phone: order.phone || shippingAddress.phone || billingAddress.phone || '0',
    products: products
  };

  logger.info({ orderId, enshieldOrderData }, "Sending order to Enshield");

  // Send order data to Enshield API
  // Extract just the numeric ID for the Enshield URL
  const numericOrderId = normalizedOrderId.split('/').pop();
  const enshieldUrl = `https://manage.enshield.com/api/orders/miva/${numericOrderId}`;
  // logger.info(enshieldUrl, apikey: apiKey);
  try {
    logger.info({ enshieldUrl, headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Api-Key': '***' }, body: enshieldOrderData }, "Making request to Enshield API");

    const response = await fetch(enshieldUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Api-Key': apiKey
      },
      body: JSON.stringify(enshieldOrderData)
    });

    logger.info({ orderId, status: response.status, statusText: response.statusText, contentType: response.headers.get('content-type') }, "Received response from Enshield API");

    // Get the response text first so we can log it
    const responseText = await response.text();
    logger.info({ orderId, responseText: responseText.substring(0, 500) }, "Enshield response body (first 500 chars)");

    if (!response.ok) {
      logger.error({ orderId, status: response.status, statusText: response.statusText, error: responseText }, "Enshield API returned error");
      throw new Error(`Enshield API error: ${response.status} ${response.statusText} - ${responseText.substring(0, 200)}`);
    }

    // Only parse JSON for successful responses
    let result;
    try {
      result = JSON.parse(responseText);
    } catch (jsonError) {
      logger.error({ orderId, error: jsonError.message, responseText: responseText.substring(0, 500) }, "Failed to parse Enshield response as JSON");
      throw new Error(`Enshield API returned invalid JSON: ${jsonError.message}. Response: ${responseText.substring(0, 200)}`);
    }

    logger.info({ orderId, result }, "Successfully sent order to Enshield");

    return { success: true, enshieldResponse: result };
  } catch (error) {
    logger.error({ orderId, error: error.message, stack: error.stack }, "Failed to send order to Enshield");
    throw error;
  }
};

/** @type { ActionOptions } */
export const options = {
  timeoutMS: 30000
};

export const params = {
  orderId: { type: "string" },
  shopId: { type: "string" }
};