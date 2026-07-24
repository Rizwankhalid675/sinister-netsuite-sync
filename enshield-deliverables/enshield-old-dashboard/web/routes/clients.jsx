import { useDeferredValue, useState } from "react";
import { Gate } from "../lib/useRole";
import { PERMISSIONS } from "../lib/rbac";
import { usePagedResource } from "../lib/usePagedResource";
import { ListToolbar, PageNavigation, PageStatus } from "../components/OperationalPage";
import "./dashboard.css";

const money = (minor, amount, currency = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(
    minor != null ? Number(minor) / 100 : Number(amount || 0)
  );

export function ClientsPage() {
  return <Gate permission={PERMISSIONS.VIEW_CLIENTS} fallback={<div role="status" className="esd-empty">You don’t have permission to view clients.</div>}><ClientsInner /></Gate>;
}

function ClientsInner() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const deferredSearch = useDeferredValue(search);
  const data = usePagedResource("/api/clients", { search: deferredSearch.trim(), status });
  return <section aria-label="Clients" aria-live="polite">
    <ListToolbar search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={["active", "paused", "onboarding", "churned"]} />
    <PageStatus loading={data.loading} error={data.error} empty={!data.rows.length} noun="clients" onRetry={data.retry} />
    {!data.loading && !data.error && data.rows.length ? <div className="esd-table-wrap"><table className="esd-table">
      <thead><tr><th>Store</th><th>Store ID</th><th>Plan</th><th>Status</th><th>Claims</th><th>Value in transit</th><th>Created</th></tr></thead>
      <tbody>{data.rows.map((client) => <tr key={client.id}>
        <td data-label="Store">{client.storeName || "—"}</td><td data-label="Store ID">{client.storeId || "—"}</td>
        <td data-label="Plan">{client.plan || "—"}</td><td data-label="Status">{client.status || "—"}</td>
        <td data-label="Claims">{client.claimCount ?? 0}</td>
        <td data-label="Value in transit">{money(client.valueInTransitMinor, client.valueInTransit, client.valueInTransitCurrency)}</td>
        <td data-label="Created">{client.createdAt ? new Date(client.createdAt).toLocaleDateString() : "—"}</td>
      </tr>)}</tbody></table></div> : null}
    <PageNavigation hasPrevious={data.hasPreviousPage} hasNext={data.hasNextPage} onPrevious={data.previous} onNext={data.next} />
  </section>;
}
