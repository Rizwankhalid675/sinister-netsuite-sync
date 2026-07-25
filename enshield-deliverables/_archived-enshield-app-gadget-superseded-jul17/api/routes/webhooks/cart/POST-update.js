import crypto from "crypto";

const route = async ({ request, reply, logger, api, connections }) => {
  try {
    // Get Shopify webhook headers
    const hmac = request.headers['x-shopify-hmac-sha256'];
    const shopDomain = request.headers['x-shopify-shop-domain'];
    const topic = request.headers['x-shopify-topic'];
    
    logger.info({ 
      topic, 
      shopDomain,
      hasHmac: !!hmac 
    }, "Received cart update webhook");

    // Verify HMAC is present (Shopify webhooks include this for authentication)
    if (!hmac) {
      logger.warn("Missing HMAC header in webhook request");
      await reply.code(401).send({ error: "Unauthorized - Missing HMAC" });
      return;
    }

    // Parse cart data from request body
    const cartData = request.body;
    
    if (!cartData || !cartData.token) {
      logger.warn("Invalid cart data received in webhook");
      await reply.code(400).send({ error: "Invalid cart data" });
      return;
    }

    // Log the cart update event with relevant details
    logger.info({
      cartToken: cartData.token,
      itemCount: cartData.items?.length || 0,
      totalPrice: cartData.total_price,
      currency: cartData.currency,
      shopDomain: shopDomain
    }, "Cart update event processed");

    // Check if cart has shipping insurance selected via cart attributes
    const attributes = cartData.attributes || {};
    const insuranceSelected = attributes['shipping_insurance'] === 'true' || 
                             attributes['shipping_insurance'] === true;

    if (insuranceSelected) {
      logger.info({ cartToken: cartData.token }, "Shipping insurance selected in cart");

      // Find the shop to validate insurance
      if (shopDomain) {
        const shops = await api.shopifyShop.findMany({
          filter: {
            domain: { equals: shopDomain }
          },
          select: { id: true },
          first: 1
        });

        if (shops.length > 0) {
          const shopId = shops[0].id;

          // Get active insurance settings for this shop
          const insuranceSettings = await api.shippingInsuranceSetting.findMany({
            filter: {
              shopId: { equals: shopId },
              status: { equals: "active" }
            },
            select: { insuranceRate: true },
            first: 1
          });

          if (insuranceSettings.length > 0) {
            const insuranceRate = insuranceSettings[0].insuranceRate;
            
            // Shopify cart total_price is in cents (or smallest currency unit)
            const cartTotal = parseFloat(cartData.total_price) / 100;
            
            // Calculate expected insurance cost
            const expectedInsuranceCost = cartTotal * (insuranceRate / 100);
            const priceInDollars = expectedInsuranceCost.toFixed(2);
            
            // Get the insurance product for this shop
            const insuranceProduct = await api.shippingInsuranceProduct.findFirst({
              filter: { shopId: { equals: shopId } },
              select: { productId: true, productGid: true }
            });
            
            if (insuranceProduct) {
              // Get Shopify API client
              const shopify = await connections.shopify.forShopId(shopId);
              
              // Construct product GID if not stored
              const productGid = insuranceProduct.productGid || `gid://shopify/Product/${insuranceProduct.productId}`;
              
              logger.info({ productGid, productId: insuranceProduct.productId }, 'Checking for existing variant');
              
              // Check if variant with this price already exists
              try {
                const productQuery = await shopify.graphql(
                  `query($id: ID!) {
                    product(id: $id) {
                      id
                      title
                      variants(first: 100) {
                        edges {
                          node {
                            id
                            price
                            inventoryPolicy
                          }
                        }
                      }
                    }
                  }`,
                  { id: productGid }
                );
                
                logger.info({ 
                  productTitle: productQuery.product?.title,
                  variantCount: productQuery.product?.variants?.edges?.length 
                }, 'Product query result');
                
                const existingVariant = productQuery.product?.variants?.edges?.find(
                  edge => edge.node.price === priceInDollars
                );
                
                if (!existingVariant) {
                  logger.info({ price: priceInDollars, productGid }, 'Creating new insurance variant');
                  
                  // Create new variant with specific price
                  const createVariant = await shopify.graphql(
                    `mutation productVariantCreate($productId: ID!, $price: String!) {
                      productVariantCreate(input: {
                        productId: $productId
                        price: $price
                        inventoryPolicy: CONTINUE
                      }) {
                        productVariant {
                          id
                          legacyResourceId
                          price
                          inventoryPolicy
                        }
                        userErrors {
                          field
                          message
                        }
                      }
                    }`,
                    {
                      productId: productGid,
                      price: priceInDollars
                    }
                  );
                  
                  if (createVariant.productVariantCreate?.userErrors?.length > 0) {
                    logger.error({ 
                      errors: createVariant.productVariantCreate.userErrors,
                      price: priceInDollars
                    }, 'Failed to create variant');
                  } else {
                    logger.info({ 
                      variantGid: createVariant.productVariantCreate.productVariant.id,
                      variantId: createVariant.productVariantCreate.productVariant.legacyResourceId,
                      price: priceInDollars 
                    }, 'Successfully created new insurance variant');
                  }
                } else {
                  logger.info({ 
                    variantGid: existingVariant.node.id,
                    price: priceInDollars 
                  }, 'Found existing insurance variant with matching price');
                }
              } catch (graphqlError) {
                logger.error({ 
                  error: graphqlError.message,
                  productGid 
                }, 'GraphQL error when checking/creating variant');
              }
            } else {
              logger.warn({ 
                shopId,
                cartToken: cartData.token 
              }, "No insurance product found for shop");
            }
            
            // Get insurance cost from cart attributes
            const cartInsuranceCost = parseFloat(attributes['shipping_insurance_cost'] || 0);

            // Validate insurance cost (allow small floating point differences)
            const tolerance = 0.01;
            if (Math.abs(cartInsuranceCost - expectedInsuranceCost) > tolerance) {
              logger.warn({
                cartToken: cartData.token,
                expectedInsuranceCost: expectedInsuranceCost.toFixed(2),
                actualInsuranceCost: cartInsuranceCost.toFixed(2),
                cartTotal: cartTotal.toFixed(2),
                insuranceRate: insuranceRate,
                difference: (cartInsuranceCost - expectedInsuranceCost).toFixed(2)
              }, "Insurance cost mismatch detected - validation failed");
            } else {
              logger.info({
                cartToken: cartData.token,
                insuranceCost: cartInsuranceCost.toFixed(2),
                cartTotal: cartTotal.toFixed(2),
                insuranceRate: insuranceRate
              }, "Insurance cost validated successfully");
            }
          } else {
            logger.info({ 
              shopId, 
              cartToken: cartData.token 
            }, "No active insurance settings found for shop");
          }
        } else {
          logger.warn({ 
            shopDomain,
            cartToken: cartData.token 
          }, "Shop not found for domain");
        }
      } else {
        logger.warn({ 
          cartToken: cartData.token 
        }, "Missing shop domain header - cannot validate insurance");
      }
    } else {
      logger.info({ 
        cartToken: cartData.token 
      }, "No insurance selected in cart");
    }

    // Return 200 OK to acknowledge receipt
    await reply.code(200).send({ received: true });

  } catch (error) {
    logger.error({ 
      error: error.message, 
      stack: error.stack 
    }, "Error processing cart update webhook");
    
    await reply.code(500).send({ error: "Internal server error" });
  }
};

// Configure route options
route.options = {
  cors: {
    // Allow requests from any origin for Shopify webhooks
    origin: true
  }
};

export default route;