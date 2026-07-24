import { useDeferredValue, useState } from "react";
import { Gate } from "../lib/useRole";
import { PERMISSIONS } from "../lib/rbac";
import { usePagedResource } from "../lib/usePagedResource";
import { ListToolbar, PageNavigation, PageStatus } from "../components/OperationalPage";
import "./dashboard.css";

const STATUSES = ["Draft", "Submitted", "New", "Under Review", "Awaiting Customer", "Awaiting Merchant", "Awaiting Carrier", "Approved", "Partially Approved", "Denied", "Payment Pending", "Paid", "Closed", "Reopened", "Cancelled"];
const money = (minor, amount, currency = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor != null ? Number(minor) / 100 : Number(amount || 0));

export function ClaimsPage() {
  return <Gate permission={PERMISSIONS.VIEW_CLAIMS} fallback={<div role="status" className="esd-empty">You don’t have permission to view claims.</div>}><ClaimsInner /></Gate>;
}

function ClaimsInner() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const data = usePagedResource("/api/claims", { search: useDeferredValue(search).trim(), status });
  return <section aria-label="Claims" aria-live="polite">
    <ListToolbar search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={STATUSES} />
    <PageStatus loading={data.loading} error={data.error} empty={!data.rows.length} noun="claims" onRetry={data.retry} />
    {!data.loading && !data.error && data.rows.length ? <div className="esd-table-wrap"><table className="esd-table">
      <thead><tr><th>Order</th><th>Store</th><th>Reason</th><th>Status</th><th>Claim value</th><th>Order value</th><th>Created</th></tr></thead>
      <tbody>{data.rows.map((claim) => <tr key={claim.id}>
        <td data-label="Order">{claim.order?.name || "—"}</td><td data-label="Store">{claim.client?.storeName || "—"}</td>
        <td data-label="Reason">{claim.reason || "—"}</td><td data-label="Status">{claim.status || "—"}</td>
        <td data-label="Claim value">{money(claim.claimValueMinor, claim.claimValue, claim.claimCurrency)}</td>
        <td data-label="Order value">{money(claim.orderValueMinor, claim.orderValue, claim.orderCurrency)}</td>
        <td data-label="Created">{claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : "—"}</td>
      </tr>)}</tbody></table></div> : null}
    <PageNavigation hasPrevious={data.hasPreviousPage} hasNext={data.hasNextPage} onPrevious={data.previous} onNext={data.next} />
  </section>;
}
