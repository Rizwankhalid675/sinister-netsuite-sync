import { useEffect, useState } from "react";
import { Link } from "react-router";
import { Gate, useRole } from "../lib/useRole";
import { PERMISSIONS } from "../lib/rbac";
import "./dashboard.css";

export function InternalSettingsPage() {
  return <Gate permission={PERMISSIONS.MANAGE_SETTINGS} fallback={<div role="status" className="esd-empty">You don’t have permission to view internal settings.</div>}><InternalSettingsInner /></Gate>;
}

function InternalSettingsInner() {
  const [state, setState] = useState({ loading: true, data: null, error: "" });
  const [reloadKey, setReloadKey] = useState(0);
  const { selectedShopId } = useRole();
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/dashboard-metrics?range=all&shopId=${encodeURIComponent(selectedShopId)}`, { credentials: "include", signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok || !body.success) throw new Error(body.error || "Request failed"); return body; })
      .then((data) => setState({ loading: false, data, error: "" }))
      .catch((reason) => { if (reason.name !== "AbortError") setState({ loading: false, data: null, error: reason.message }); });
    return () => controller.abort();
  }, [selectedShopId, reloadKey]);
  if (state.loading) return <div className="esd-loading" role="status" aria-live="polite">Loading internal settings…</div>;
  if (state.error) return <div className="esd-error" role="status" aria-live="polite">Couldn’t load internal settings: {state.error} <button className="esd-link-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>Try again</button></div>;
  return <section className="esd-card" aria-label="Internal settings" aria-live="polite">
    <h2>Protection overview</h2>
    <dl className="esd-detail-grid"><div><dt>Status</dt><dd>{state.data?.metrics?.status || "inactive"}</dd></div><div><dt>Insurance rate</dt><dd>{state.data?.metrics?.insuranceRate ?? "Not configured"}</dd></div></dl>
    <p>Merchant storefront images and “learn more” content are managed separately.</p>
    <Gate permission={PERMISSIONS.MANAGE_STOREFRONT_CONFIGURATION}><Link className="esd-btn" to="/storefront-settings">Open storefront settings</Link></Gate>
  </section>;
}
