import { useDeferredValue, useState } from "react";
import { Gate } from "../lib/useRole";
import { PERMISSIONS } from "../lib/rbac";
import { usePagedResource } from "../lib/usePagedResource";
import { ListToolbar, PageNavigation, PageStatus } from "../components/OperationalPage";
import "./dashboard.css";

const money = (amount, currency = "USD") =>
  new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(amount || 0));

function toCsv(rows) {
  const header = ["Client", "Order", "Value", "Protection", "Financial", "Fulfillment", "Created"];
  const lines = rows.map((order) => [
    order.shop?.name || order.shop?.domain || "",
    order.name || order.id,
    money(order.value, order.currency),
    order.protected ? "Protected" : "Not protected",
    order.financialStatus || "",
    order.fulfillmentStatus || "",
    order.createdAt ? new Date(order.createdAt).toISOString() : "",
  ].map((value) => `"${String(value).replace(/"/g, '""')}"`).join(","));
  return [header.join(","), ...lines].join("\n");
}

function downloadCsv(rows) {
  const blob = new Blob([toCsv(rows)], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `orders-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

export function OrdersPage() {
  return <Gate permission={PERMISSIONS.VIEW_ORDERS} fallback={<div role="status" className="esd-empty">You don’t have permission to view orders.</div>}><OrdersInner /></Gate>;
}

function OrdersInner() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const deferredSearch = useDeferredValue(search);
  const data = usePagedResource("/api/orders", { search: deferredSearch.trim(), status });
  const protectedCount = data.rows.filter((order) => order.protected).length;
  const pageValue = data.rows.reduce((sum, order) => sum + Number(order.value || 0), 0);
  return (
    <section aria-label="Orders" aria-live="polite">
      <div className="esd-row-actions" style={{ marginBottom: 12 }}>
        <span className="esd-chip">Protected on page: {protectedCount}/{data.rows.length}</span>
        <span className="esd-chip">Page value: {money(pageValue)}</span>
        <button type="button" className="esd-btn esd-btn-sm" disabled={data.loading} onClick={data.retry}>
          {data.loading ? "Fetching…" : "Fetch"}
        </button>
        <Gate permission={PERMISSIONS.MANAGE_ORDERS}>
          <button type="button" className="esd-btn esd-btn-sm" disabled={!data.rows.length} onClick={() => downloadCsv(data.rows)}>Export CSV</button>
        </Gate>
      </div>
      <ListToolbar search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={["fulfilled", "in_transit", "unfulfilled", "cancelled"]} />
      <PageStatus loading={data.loading} error={data.error} empty={!data.rows.length} noun="orders" onRetry={data.retry} />
      {!data.loading && !data.error && data.rows.length ? (
        <div className="esd-table-wrap"><table className="esd-table">
          <thead><tr><th>Client</th><th>Order</th><th>Value</th><th>Protection</th><th>Financial</th><th>Fulfillment</th><th>Created</th></tr></thead>
          <tbody>{data.rows.map((order) => <tr key={order.id}>
            <td data-label="Client">{order.shop?.name || order.shop?.domain || "—"}</td>
            <td data-label="Order">{order.name || order.id}</td>
            <td data-label="Value">{money(order.value, order.currency)}</td>
            <td data-label="Protection"><span className={`esd-badge ${order.protected ? "esd-badge-active" : ""}`}>{order.protected ? "Protected" : "Not protected"}</span></td>
            <td data-label="Financial">{order.financialStatus || "—"}</td>
            <td data-label="Fulfillment">{order.fulfillmentStatus || "—"}</td>
            <td data-label="Created">{order.createdAt ? new Date(order.createdAt).toLocaleDateString() : "—"}</td>
          </tr>)}</tbody>
        </table></div>
      ) : null}
      <PageNavigation hasPrevious={data.hasPreviousPage} hasNext={data.hasNextPage} onPrevious={data.previous} onNext={data.next} />
    </section>
  );
}
