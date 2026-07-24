import {
  AppType,
  Provider as GadgetProvider,
  useGadget,
} from "@gadgetinc/react-shopify-app-bridge";
import { Box, Card, Page, Spinner, Text } from "@shopify/polaris";
import { useEffect, useState } from "react";
import {
  Outlet,
  Navigate,
  Route,
  RouterProvider,
  createBrowserRouter,
  createRoutesFromElements,
  useLocation,
  useNavigate,
} from "react-router";
import { api } from "../api";
import { IndexPage } from "../routes/index";
import { DashboardPage } from "../routes/dashboard";
import { ClientsPage } from "../routes/clients";
import { OrdersPage } from "../routes/orders";
import { ClaimsPage } from "../routes/claims";
import { ErrorsPage } from "../routes/errors";
import { ReportsPage } from "../routes/reports";
import { InternalSettingsPage } from "../routes/internalSettings";
import { InternalAuthCallbackPage, InternalLoginPage } from "../routes/internalLogin";
import { UsersPage } from "../routes/users";
import { FinancePage } from "../routes/finance";
import { Gate, RoleProvider } from "../lib/useRole";
import { PERMISSIONS } from "../lib/rbac";
import { InternalAppShell } from "./InternalAppShell";
import "./App.css";

function Error404() {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const appURL = process.env.GADGET_PUBLIC_SHOPIFY_APP_URL;

    if (appURL && location.pathname === new URL(appURL).pathname) {
      navigate("/", { replace: true });
    }
  }, [location.pathname]);

  return <div>404 not found</div>;
}

function App() {
  const router = createBrowserRouter(
    createRoutesFromElements(
      <Route path="/" element={<Layout />}>
        <Route path="internal-login" element={<InternalLoginPage />} />
        <Route path="internal-auth/callback" element={<InternalAuthCallbackPage />} />
        <Route path="storefront-settings" element={<IndexPage />} />
        <Route element={<InternalAppShell />}>
          <Route index element={<DashboardPage />} />
          <Route path="dashboard" element={<DashboardPage />} />
          <Route path="clients" element={<ClientsPage />} />
          <Route path="orders" element={<OrdersPage />} />
          <Route path="claims" element={<ClaimsPage />} />
          <Route path="errors" element={<ErrorsPage />} />
          <Route path="reports" element={<ReportsPage />} />
          <Route path="settings" element={<InternalSettingsPage />} />
          <Route path="users" element={<UsersPage />} />
          <Route path="finance" element={<FinancePage />} />
        </Route>
        <Route path="*" element={<Error404 />} />
      </Route>
    )
  );

  return (
    <>
      <RouterProvider router={router} />
    </>
  );
}

function PermissionRoute({ permission, label, children }) {
  return (
    <Gate
      permission={permission}
      fallback={<div className="esd-empty">You don't have permission to view {label}.</div>}
    >
      {children}
    </Gate>
  );
}

function Layout() {
  const location = useLocation();
  const isInternalAuthPath = location.pathname === "/internal-login" ||
    location.pathname === "/internal-auth/callback";
  const isMerchantPath = location.pathname === "/storefront-settings";

  if (isInternalAuthPath) return <Outlet />;
  if (!isMerchantPath) return <InternalSessionEntry />;

  return (
    <GadgetProvider
      type={AppType.Embedded}
      shopifyApiKey={window.gadgetConfig.apiKeys.shopify}
      api={api}
    >
      <MerchantAuthenticatedApp />
    </GadgetProvider>
  );
}

function MerchantAuthenticatedApp() {
  // we use `isAuthenticated` to render pages once the OAuth flow is complete!
  const { isAuthenticated, loading } = useGadget();
  if (loading) {
    return (
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          alignItems: "center",
          height: "100%",
          width: "100%",
        }}
      >
        <Spinner accessibilityLabel="Spinner example" size="large" />
      </div>
    );
  }
  // DEV-ONLY: allow previewing the app outside the Shopify Admin in the
  // development environment. Never true in production, so the Shopify-Admin
  // guard below is fully preserved for live. Revert by deleting this line.
  const devPreview = process.env.GADGET_PUBLIC_APP_ENV === "development";

  return isAuthenticated || devPreview ? <EmbeddedApp /> : <UnauthenticatedApp />;
}

function InternalSessionEntry() {
  const [state, setState] = useState("loading");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/me", { credentials: "include", signal: controller.signal })
      .then((response) => setState(response.ok ? "ready" : "login"))
      .catch((error) => {
        if (error.name !== "AbortError") setState("login");
      });
    return () => controller.abort();
  }, []);
  if (state === "login") return <Navigate to="/internal-login" replace />;
  if (state === "loading") return <div role="status" aria-live="polite">Checking internal session…</div>;
  return <RoleProvider><EmbeddedApp /></RoleProvider>;
}

function EmbeddedApp() {
  return <Outlet />;
}

function UnauthenticatedApp() {
  return (
    <Page>
      <div style={{ height: "80px" }}>
        <Card padding="500">
          <Text variant="headingLg" as="h1">
            App must be viewed in the Shopify Admin
          </Text>
          <Box paddingBlockStart="200">
            <Text variant="bodyLg" as="p">
              Edit this page:{" "}
              <a
                href={`/edit/${process.env.GADGET_PUBLIC_APP_ENV}/files/web/components/App.jsx`}
              >
                web/components/App.jsx
              </a>
            </Text>
          </Box>
        </Card>
      </div>
    </Page>
  );
}

export default App;
