import { useDeferredValue, useEffect, useState } from "react";
import { Gate } from "../lib/useRole";
import { PERMISSIONS } from "../lib/rbac";
import { usePagedResource } from "../lib/usePagedResource";
import { ListToolbar, PageNavigation, PageStatus } from "../components/OperationalPage";
import "./dashboard.css";

const money = (minor, amount, currency = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: currency || "USD" }).format(
    minor != null ? Number(minor) / 100 : Number(amount || 0)
  );

function toCsv(rows) {
  const header = ["Store", "Platform", "Store ID", "Plan", "Status", "Claims", "Value in transit", "Created"];
  const lines = rows.map((client) => [
    client.storeName || "", client.platform || "", client.storeId || "", client.plan || "", client.status || "",
    client.claimCount ?? 0,
    money(client.valueInTransitMinor, client.valueInTransit, client.valueInTransitCurrency),
    client.createdAt ? new Date(client.createdAt).toISOString() : "",
  ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
  return [header.join(","), ...lines].join("\n");
}

function downloadCsv(rows) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `clients-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function ClientsPage() {
  return <Gate permission={PERMISSIONS.VIEW_CLIENTS} fallback={<div role="status" className="esd-empty">You don’t have permission to view clients.</div>}><ClientsInner /></Gate>;
}

function ClientsInner() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const deferredSearch = useDeferredValue(search);
  const data = usePagedResource("/api/clients", { search: deferredSearch.trim(), status });
  const activeCount = data.rows.filter((client) => client.status === "active").length;
  const totalClaims = data.rows.reduce((sum, client) => sum + (client.claimCount || 0), 0);
  const totalTransitMinor = data.rows.reduce((sum, client) => sum + Number(client.valueInTransitMinor ?? Number(client.valueInTransit || 0) * 100), 0);
  const currency = data.rows.find((client) => client.valueInTransitCurrency)?.valueInTransitCurrency || "USD";
  return <section aria-label="Clients" aria-live="polite">
    <div className="esd-client-summary" aria-label="Client portfolio summary">
      <article><span>Clients on page</span><strong>{data.rows.length}</strong><small>Current filtered view</small></article>
      <article><span>Active clients</span><strong>{activeCount}</strong><small>{data.rows.length ? `${Math.round((activeCount / data.rows.length) * 100)}% of this view` : "No records"}</small></article>
      <article><span>Open claims</span><strong>{totalClaims}</strong><small>Across visible clients</small></article>
      <article className="is-value"><span>Value in transit</span><strong>{money(totalTransitMinor, null, currency)}</strong><small>Live operational exposure</small></article>
    </div>
    <div className="esd-client-actions">
      <div><strong>Client directory</strong><span>Search, filter, export, or add a connected store.</span></div>
      <div className="esd-row-actions">
      <button type="button" className="esd-btn esd-btn-sm" disabled={data.loading} onClick={data.retry}>
        {data.loading ? "Fetching…" : "Fetch"}
      </button>
      <Gate permission={PERMISSIONS.EDIT_CLIENTS}>
        <button type="button" className="esd-btn esd-btn-sm" disabled={!data.rows.length} onClick={() => downloadCsv(data.rows)}>Export CSV</button>
        <button type="button" className="esd-btn esd-btn-sm esd-btn-primary" onClick={() => setShowCreate(true)}>Add client</button>
      </Gate>
      </div>
    </div>
    {showCreate ? <CreateClientModal onClose={() => setShowCreate(false)} onCreated={() => { setShowCreate(false); data.retry(); }} /> : null}
    <ListToolbar search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={["active", "paused", "onboarding", "churned"]} />
    <PageStatus loading={data.loading} error={data.error} empty={!data.rows.length} noun="clients" onRetry={data.retry} />
    {!data.loading && !data.error && data.rows.length ? <div className="esd-table-wrap"><table className="esd-table">
      <thead><tr><th>Store</th><th>Platform</th><th>Store ID</th><th>Plan</th><th>Status</th><th>Claims</th><th>Value in transit</th><th>Created</th></tr></thead>
      <tbody>{data.rows.map((client) => <tr key={client.id}>
        <td data-label="Store"><strong>{client.storeName || "—"}</strong></td>
        <td data-label="Platform"><span className={`esd-source-mark is-${String(client.platform || "unknown").toLowerCase()}`}><span>{String(client.platform || "?").slice(0, 1)}</span>{client.platform || "Unknown"}</span></td>
        <td data-label="Store ID"><span className="esd-mono">{client.storeId || "—"}</span></td>
        <td data-label="Plan">{client.plan || "—"}</td>
        <td data-label="Status"><span className={`esd-badge esd-badge-${(client.status || "").toLowerCase()}`}>{client.status || "—"}</span></td>
        <td data-label="Claims">{client.claimCount ?? 0}</td>
        <td data-label="Value in transit">{money(client.valueInTransitMinor, client.valueInTransit, client.valueInTransitCurrency)}</td>
        <td data-label="Created">{client.createdAt ? new Date(client.createdAt).toLocaleDateString() : "—"}</td>
      </tr>)}</tbody></table></div> : null}
    <PageNavigation hasPrevious={data.hasPreviousPage} hasNext={data.hasNextPage} onPrevious={data.previous} onNext={data.next} />
  </section>;
}

const STATUS_OPTIONS = ["onboarding", "active", "paused", "churned"];

function CreateClientModal({ onClose, onCreated }) {
  const [shops, setShops] = useState([]);
  const [shopsLoading, setShopsLoading] = useState(true);
  const [shopsError, setShopsError] = useState("");
  const [shopId, setShopId] = useState("");
  const [storeName, setStoreName] = useState("");
  const [storeId, setStoreId] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("onboarding");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/clients-shop-options", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.error || "Failed to load stores");
        return body;
      })
      .then((body) => setShops(body.shops || []))
      .catch((reason) => { if (reason.name !== "AbortError") setShopsError(reason.message); })
      .finally(() => setShopsLoading(false));
    return () => controller.abort();
  }, []);

  const handleShopChange = (event) => {
    const nextShopId = event.target.value;
    setShopId(nextShopId);
    const shop = shops.find((s) => s.id === nextShopId);
    if (shop && !storeName) setStoreName(shop.label);
    if (shop && !storeId) setStoreId(shop.domain || shop.id);
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setError("");
    if (!shopId) { setError("Select a store."); return; }
    if (!storeName.trim()) { setError("Store name is required."); return; }
    if (!storeId.trim()) { setError("Store ID is required."); return; }
    setSubmitting(true);
    try {
      const response = await fetch("/api/clients", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId, storeName: storeName.trim(), storeId: storeId.trim(), plan: plan.trim(), status }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Failed to create client");
      onCreated();
    } catch (reason) {
      setError(reason.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="esd-modal-overlay" role="presentation" onClick={onClose}>
      <div
        className="esd-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Add client"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 style={{ marginTop: 0 }}>Add client</h2>
        {shopsError ? <p role="alert" className="esd-error">{shopsError}</p> : null}
        {!shopsLoading && !shopsError && !shops.length ? (
          <p role="status">Every connected store already has a client record.</p>
        ) : (
          <form onSubmit={handleSubmit}>
            <label htmlFor="esd-create-client-shop">Store</label>
            <select id="esd-create-client-shop" value={shopId} onChange={handleShopChange} disabled={shopsLoading} required>
              <option value="">{shopsLoading ? "Loading stores…" : "Select a store"}</option>
              {shops.map((shop) => (
                <option key={shop.id} value={shop.id}>{shop.label}</option>
              ))}
            </select>

            <label htmlFor="esd-create-client-name">Store name</label>
            <input id="esd-create-client-name" type="text" value={storeName} onChange={(e) => setStoreName(e.target.value)} required />

            <label htmlFor="esd-create-client-storeid">Store ID</label>
            <input id="esd-create-client-storeid" type="text" value={storeId} onChange={(e) => setStoreId(e.target.value)} required />

            <label htmlFor="esd-create-client-plan">Plan</label>
            <input id="esd-create-client-plan" type="text" value={plan} onChange={(e) => setPlan(e.target.value)} placeholder="e.g. Shopify Advanced" />

            <label htmlFor="esd-create-client-status">Status</label>
            <select id="esd-create-client-status" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>{option}</option>
              ))}
            </select>

            {error ? <p role="alert" className="esd-error">{error}</p> : null}

            <div className="esd-row-actions" style={{ marginTop: 16 }}>
              <button type="button" className="esd-btn esd-btn-sm" onClick={onClose} disabled={submitting}>Cancel</button>
              <button type="submit" className="esd-btn esd-btn-sm esd-btn-primary" disabled={submitting || shopsLoading || !shops.length}>
                {submitting ? "Creating…" : "Create client"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
