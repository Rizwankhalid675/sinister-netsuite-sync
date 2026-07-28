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
    setState({ loading: true, data: null, error: "" });
    const timeout = window.setTimeout(() => controller.abort("timeout"), 12_000);
    fetch(`/api/settings-overview?shopId=${encodeURIComponent(selectedShopId)}`, { credentials: "include", signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok || !body.success) throw new Error(body.error || "Request failed"); return body; })
      .then((data) => setState({ loading: false, data, error: "" }))
      .catch((reason) => {
        if (controller.signal.reason === "timeout") setState({ loading: false, data: null, error: "The settings request timed out." });
        else if (reason.name !== "AbortError") setState({ loading: false, data: null, error: reason.message });
      })
      .finally(() => window.clearTimeout(timeout));
    return () => { window.clearTimeout(timeout); controller.abort(); };
  }, [selectedShopId, reloadKey]);
  if (state.loading) return <div className="esd-loading" role="status" aria-live="polite">Loading internal settings…</div>;
  if (state.error) return <div className="esd-error" role="status" aria-live="polite">Couldn’t load internal settings: {state.error} <button className="esd-link-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>Try again</button></div>;
  const metrics = state.data || {};
  return (
    <section aria-label="Internal settings" aria-live="polite">
      <div className="esd-settings-grid">
        <div className="esd-card">
          <h2>Protection overview</h2>
          <dl className="esd-detail-grid">
            <div><dt>Status</dt><dd>{metrics.status || "inactive"}</dd></div>
            <div><dt>Insurance rate</dt><dd>{metrics.insuranceRate ?? "Not configured"}</dd></div>
            <div><dt>Shop</dt><dd>{selectedShopId || "—"}</dd></div>
          </dl>
        </div>
        <div className="esd-card">
          <h2>Storefront configuration</h2>
          <p>Merchant storefront images and “learn more” content are managed separately.</p>
          <Gate permission={PERMISSIONS.MANAGE_STOREFRONT_CONFIGURATION} fallback={<span className="esd-locknote">Requires storefront configuration permission</span>}>
            <Link className="esd-btn" to="/storefront-settings">Open storefront settings</Link>
          </Gate>
        </div>
        <div className="esd-card">
          <h2>Access &amp; roles</h2>
          <p>Manage staff accounts, role assignments, and permission scopes for this workspace.</p>
          <Gate permission={PERMISSIONS.MANAGE_USERS} fallback={<span className="esd-locknote">Requires user management permission</span>}>
            <Link className="esd-btn" to="/users">Manage users</Link>
          </Gate>
        </div>
        <div className="esd-card">
          <h2>Audit &amp; compliance</h2>
          <p>Review every create, update, delete, approval, and rejection recorded across the dashboard.</p>
          <Gate permission={PERMISSIONS.VIEW_AUDIT} fallback={<span className="esd-locknote">Requires audit log permission</span>}>
            <Link className="esd-btn" to="/audit-log">Open audit log</Link>
          </Gate>
        </div>
      </div>
    </section>
  );
}
