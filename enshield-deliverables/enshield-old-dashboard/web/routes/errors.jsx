import { useDeferredValue, useState } from "react";
import { Gate } from "../lib/useRole";
import { PERMISSIONS } from "../lib/rbac";
import { usePagedResource } from "../lib/usePagedResource";
import { ListToolbar, PageNavigation, PageStatus } from "../components/OperationalPage";
import "./dashboard.css";

export function ErrorsPage() {
  return <Gate permission={PERMISSIONS.VIEW_AUDIT} fallback={<div role="status" className="esd-empty">You don’t have permission to view errors.</div>}><ErrorsInner /></Gate>;
}

function ErrorsInner() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const data = usePagedResource("/api/errors", { search: useDeferredValue(search).trim(), status });
  return (
    <section aria-label="Integration errors" aria-live="polite">
      <ListToolbar search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={["retry", "permanent_failure"]} />
      <PageStatus loading={data.loading} error={data.error} empty={!data.rows.length} noun="integration errors" onRetry={data.retry} />
      {!data.loading && !data.error && data.rows.length ? <div className="esd-table-wrap"><table className="esd-table">
        <thead><tr><th>Client</th><th>Reference</th><th>Operation</th><th>Status</th><th>Attempts</th><th>Error code</th><th>Updated</th></tr></thead>
        <tbody>{data.rows.map((item) => <tr key={item.id}>
          <td data-label="Client">{item.shop?.name || item.shop?.domain || "—"}</td>
          <td data-label="Reference">{item.sourceRef}</td><td data-label="Operation">{item.operation}</td>
          <td data-label="Status">{item.status}</td><td data-label="Attempts">{item.attemptCount}</td>
          <td data-label="Error code">{item.lastErrorCode || "—"}</td>
          <td data-label="Updated">{item.updatedAt ? new Date(item.updatedAt).toLocaleString() : "—"}</td>
        </tr>)}</tbody>
      </table></div> : null}
      <PageNavigation hasPrevious={data.hasPreviousPage} hasNext={data.hasNextPage} onPrevious={data.previous} onNext={data.next} />
    </section>
  );
}
