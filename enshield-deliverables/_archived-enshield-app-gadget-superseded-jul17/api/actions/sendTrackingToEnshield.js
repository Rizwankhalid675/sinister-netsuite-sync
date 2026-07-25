import { assert, ActionOptions } from "gadget-server";

/** @type { ActionRun } */
export const run = async ({ params, logger, config }) => {
  logger.info("Starting sendTrackingToEnshield action", { params });

  // Validate required parameters
  assert(params.orderId, "orderId is required");
  assert(params.shopId, "shopId is required");
  assert(params.trackingNumber, "trackingNumber is required");

  const { orderId, shopId, trackingNumber } = params;

  logger.info("Validated parameters", { orderId, shopId, trackingNumber });

  // Normalize order ID - extract numeric ID from GID format if needed
  let numericOrderId = orderId;
  if (orderId.includes("gid://shopify/Order/")) {
    numericOrderId = orderId.split("/").pop();
    logger.info("Extracted numeric order ID from GID", { 
      originalId: orderId, 
      numericId: numericOrderId 
    });
  }

  // Get API key from environment variables
  const apiKey = config.ENSHIELD_API_KEY;
  assert(apiKey, "ENSHIELD_API_KEY environment variable is not configured");

  logger.info("Retrieved API key from config");

  // Prepare API request
  const url = `https://manage.enshield.com/api/orders/miva/${numericOrderId}/store-tracking-number`;
  const requestBody = {
    tracking_number: trackingNumber
  };

  logger.info("Preparing to send tracking number to Enshield", {
    url,
    orderId: numericOrderId,
    shopId,
    trackingNumber
  });

  try {
    // Call Enshield API
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": apiKey
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    logger.info("Received response from Enshield API", {
      status: response.status,
      statusText: response.statusText,
      body: responseText
    });

    if (!response.ok) {
      logger.error("Enshield API returned error response", {
        status: response.status,
        statusText: response.statusText,
        body: responseText,
        orderId: numericOrderId,
        trackingNumber
      });
      
      throw new Error(
        `Enshield API request failed: ${response.status} ${response.statusText} - ${responseText}`
      );
    }

    logger.info("Successfully sent tracking number to Enshield", {
      orderId: numericOrderId,
      trackingNumber,
      status: response.status
    });

    return {
      success: true,
      orderId: numericOrderId,
      trackingNumber,
      status: response.status
    };

  } catch (error) {
    logger.error("Error sending tracking number to Enshield", {
      error: error.message,
      orderId: numericOrderId,
      trackingNumber,
      shopId
    });
    
    throw error;
  }
};

export const params = {
  orderId: { 
    type: "string"
  },
  shopId: { 
    type: "string"
  },
  trackingNumber: { 
    type: "string"
  }
};

/** @type { ActionOptions } */
export const options = {
  timeoutMS: 30000
};
