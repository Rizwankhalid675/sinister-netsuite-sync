import { useFindFirst, useFetch, useGlobalAction } from "@gadgetinc/react";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  FormLayout,
  Layout,
  Page,
  Text,
  TextField,
} from "@shopify/polaris";
import { useState, useEffect } from "react";
import { api } from "../api";

export const IndexPage = () => {
  const [{ data: shop, fetching: fetchingShop, error: shopError }] = useFindFirst(api.shopifyShop);
  const [learnMoreUrl, setLearnMoreUrl] = useState("");
  const [desktopImageUrl, setDesktopImageUrl] = useState("");
  const [mobileImageUrl, setMobileImageUrl] = useState("");
  const [{ data: saveResult, fetching: saving, error: saveError }, save] = useFetch("/api/update-metafield", {
    method: "POST",
    sendImmediately: false,
  });
  const [metafields, setMetafields] = useState(null);
  const [fetchingMetafields, setFetchingMetafields] = useState(false);
  const [metafieldsError, setMetafieldsError] = useState(null);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);
  const [createProductSuccess, setCreateProductSuccess] = useState(false);
  const [createProductResult, setCreateProductResult] = useState(null);
  const [{ data: createProductData, fetching: creating, error: createError }, setupShippingInsuranceProduct] = useGlobalAction(api.setupShippingInsuranceProduct);

  useEffect(() => {
    if (shop && shop.id) {
      setFetchingMetafields(true);
      setMetafieldsError(null);

      fetch(`/api/get-metafields?shopId=${shop.id}`)
        .then(response => response.json())
        .then(data => {
          setMetafields(data);
          setFetchingMetafields(false);
        })
        .catch(error => {
          setMetafieldsError(error);
          setFetchingMetafields(false);
        });
    }
  }, [shop]);

  useEffect(() => {
    if (metafields && metafields.success) {
      setLearnMoreUrl(metafields.learnMoreUrl || "");
      setDesktopImageUrl(metafields.desktopImageUrl || "");
      setMobileImageUrl(metafields.mobileImageUrl || "");
    }
  }, [metafields]);

  useEffect(() => {
    if (saveResult && !saving && saveResult.metafieldValue) {
      setLearnMoreUrl(saveResult.metafieldValue);
      setShowSuccessBanner(true);
      setTimeout(() => setShowSuccessBanner(false), 3000);
    }
  }, [saveResult, saving]);

  useEffect(() => {
    if (createProductData && !creating && createProductData.success) {
      setCreateProductSuccess(true);
      setCreateProductResult(createProductData.result);
      setTimeout(() => setCreateProductSuccess(false), 5000);
    }
  }, [createProductData, creating]);

  const handleCreateProduct = async () => {
    if (shop && shop.id) {
      setCreateProductSuccess(false);
      setCreateProductResult(null);
      await setupShippingInsuranceProduct({ shopId: shop.id });
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (shop) {
      await save({
        body: JSON.stringify({
          shopId: shop.id,
          learnMoreUrl: learnMoreUrl,
          desktopImageUrl: desktopImageUrl,
          mobileImageUrl: mobileImageUrl,
        }),
        headers: {
          "content-type": "application/json",
        },
        json: true,
      });
    }
  };

  if (fetchingShop || fetchingMetafields) {
    return (
      <Page title="Shipping Insurance Settings">
        <Layout>
          <Layout.Section>
            <Card>
              <Text as="p" variant="bodyMd">Loading...</Text>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }
  if (fetchingShop || fetchingMetafields) {
    return (
      <Page title="Shipping Insurance Settings">
        <Layout>
          <Layout.Section>
            <Card>
              <Text as="p" variant="bodyMd">Loading...</Text>
            </Card>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  if (shopError) {
    return (
      <Page title="Shipping Insurance Settings">
        <Layout>
          <Layout.Section>
            <Banner tone="critical">
              <Text as="p" variant="bodyMd">Error loading shop: {shopError.toString()}</Text>
            </Banner>
          </Layout.Section>
        </Layout>
      </Page>
    );
  }

  return (
    <Page title="Shipping Insurance Settings">
      <Layout>
        {showSuccessBanner && (
          <Layout.Section>
            <Banner tone="success" onDismiss={() => setShowSuccessBanner(false)}>
              <Text as="p" variant="bodyMd">Settings saved successfully!</Text>
            </Banner>
          </Layout.Section>
        )}
        {saveError && (
          <Layout.Section>
            <Banner tone="critical">
              <Text as="p" variant="bodyMd">Error saving settings: {saveError.toString()}</Text>
            </Banner>
          </Layout.Section>
        )}
        {metafieldsError && (
          <Layout.Section>
            <Banner tone="critical">
              <Text as="p" variant="bodyMd">Error loading settings: {metafieldsError.toString()}</Text>
            </Banner>
          </Layout.Section>
        )}
        {/*  <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Shipping Insurance Product</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Create or recreate the shipping insurance product in your Shopify store.
              </Text>
              {createProductSuccess && createProductResult && (
                <Banner tone="success" onDismiss={() => setCreateProductSuccess(false)}>
                  <BlockStack gap="200">
                    <Text as="p" variant="bodyMd">Product created successfully!</Text>
                    {createProductResult.productId && (
                      <Text as="p" variant="bodyMd">Product ID: {createProductResult.productId}</Text>
                    )}
                    {createProductResult.variantId && (
                      <Text as="p" variant="bodyMd">Variant ID: {createProductResult.variantId}</Text>
                    )}
                  </BlockStack>
                </Banner>
              )}
              {createError && (
                <Banner tone="critical">
                  <Text as="p" variant="bodyMd">Error creating product: {createError.toString()}</Text>
                </Banner>
              )}
              <Button
                variant="primary"
                onClick={handleCreateProduct}
                loading={creating}
              >
                Create Shipping Product
              </Button>
            </BlockStack>
          </Card>
        </Layout.Section>*/}
        <Layout.Section>
          <Card>
            <BlockStack gap="400">
              <Text as="h2" variant="headingMd">Shipping Insurance Settings</Text>
              <Text as="p" variant="bodyMd" tone="subdued">
                Configure the learn more link and modal images for shipping insurance protection.
              </Text>
              <form onSubmit={handleSubmit}>
                <FormLayout>
                  <TextField
                    label="Learn More URL"
                    type="url"
                    value={learnMoreUrl}
                    onChange={setLearnMoreUrl}
                    helpText={
                      metafields?.learnMoreUrl
                        ? `Current value: ${metafields.learnMoreUrl}`
                        : "Enter the URL where customers can learn more about your shipping insurance offering"
                    }
                    placeholder="https://example.com/shipping-insurance"
                    autoComplete="off"
                  />
                  <TextField
                    label="Desktop Modal Image URL"
                    type="url"
                    value={desktopImageUrl}
                    onChange={setDesktopImageUrl}
                    helpText={
                      metafields?.desktopImageUrl
                        ? `Current value: ${metafields.desktopImageUrl}`
                        : "Enter the URL for the image to display in the modal on desktop devices (recommended size: 800x600px)"
                    }
                    placeholder="https://example.com/images/desktop-modal.jpg"
                    autoComplete="off"
                  />
                  <TextField
                    label="Mobile Modal Image URL"
                    type="url"
                    value={mobileImageUrl}
                    onChange={setMobileImageUrl}
                    helpText={
                      metafields?.mobileImageUrl
                        ? `Current value: ${metafields.mobileImageUrl}`
                        : "Enter the URL for the image to display in the modal on mobile devices (recommended size: 375x667px)"
                    }
                    placeholder="https://example.com/images/mobile-modal.jpg"
                    autoComplete="off"
                  />
                  <Button
                    submit
                    variant="primary"
                    loading={saving}
                  >
                    Save Settings
                  </Button>
                </FormLayout>
              </form>

            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    </Page>
  );
};
