import { useFetch } from "@gadgetinc/react";
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

export const IndexPage = () => {
  const [learnMoreUrl, setLearnMoreUrl] = useState("");
  const [desktopImageUrl, setDesktopImageUrl] = useState("");
  const [mobileImageUrl, setMobileImageUrl] = useState("");
  const [shop, setShop] = useState(null);
  const [showSuccessBanner, setShowSuccessBanner] = useState(false);

  // Load shop + metafields from a SERVER-SIDE route that resolves the shop from
  // $session. This replaces the old client-side useFindFirst(api.shopifyShop),
  // which threw GGT_PERMISSION_DENIED when opened without a live session.
  const [{ data: shopInfo, fetching: fetchingShopInfo, error: shopInfoError }] = useFetch(
    "/api/shop-info",
    { method: "GET", json: true }
  );

  const [{ data: saveResult, fetching: saving, error: saveError }, save] = useFetch(
    "/api/update-metafield",
    { method: "POST", sendImmediately: false }
  );

  // Populate form fields once the server-side shop info arrives.
  useEffect(() => {
    if (shopInfo && shopInfo.success) {
      setShop(shopInfo.shop || null);
      setLearnMoreUrl(shopInfo.learnMoreUrl || "");
      setDesktopImageUrl(shopInfo.desktopImageUrl || "");
      setMobileImageUrl(shopInfo.mobileImageUrl || "");
    }
  }, [shopInfo]);

  useEffect(() => {
    if (saveResult && !saving && saveResult.metafieldValue) {
      setLearnMoreUrl(saveResult.metafieldValue);
      setShowSuccessBanner(true);
      setTimeout(() => setShowSuccessBanner(false), 3000);
    }
  }, [saveResult, saving]);

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

  if (fetchingShopInfo) {
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

  if (shopInfoError || (shopInfo && !shopInfo.success)) {
    const message = shopInfoError
      ? shopInfoError.toString()
      : (shopInfo && shopInfo.error) || "Unknown error";
    return (
      <Page title="Shipping Insurance Settings">
        <Layout>
          <Layout.Section>
            <Banner tone="critical">
              <Text as="p" variant="bodyMd">Error loading shop: {message}</Text>
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
                      shopInfo?.learnMoreUrl
                        ? `Current value: ${shopInfo.learnMoreUrl}`
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
                      shopInfo?.desktopImageUrl
                        ? `Current value: ${shopInfo.desktopImageUrl}`
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
                      shopInfo?.mobileImageUrl
                        ? `Current value: ${shopInfo.mobileImageUrl}`
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
