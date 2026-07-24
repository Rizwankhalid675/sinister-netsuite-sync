import { useMemo, useState } from "react";
import { Gate } from "../lib/useRole.jsx";
import { PERMISSIONS } from "../lib/rbac.js";
import { usePagedResource } from "../lib/usePagedResource.jsx";
import { ListToolbar, PageNavigation, PageStatus } from "../components/OperationalPage.jsx";
import "./dashboard.css";

const ACTIONS = ["create", "update", "delete", "approve", "reject"];

export function AuditLogPage() {
  return (
    <Gate
      permission={PERMISSIONS.VIEW_AUDIT}
      fallback={<div role="status" className="esd-empty">You don’t have permission to view the audit log.</div>}
    >
      <AuditLogInner />
    </Gate>
  );
}

function formatSnapshot(value) {
  if (value == null) return "—";
  try {
    const text = JSON.stringify(value);
    return text.length > 120 ? `${text.slice(0, 117)}…` : text;
  } catch {
    return "—";
  }
}

function AuditLogInner() {
  const [search, setSearch] = useState("");
  const [action, setAction] = useState("");
  const filters = useMemo(() => ({ search, action }), [search, action]);
  const { rows, loading, error, hasNextPage, hasPreviousPage, next, previous, retry } = usePagedResource(
    "/api/audit-log",
    filters
  );

  return (
    <section aria-label="Audit log" aria-live="polite">
      <ListToolbar search={search} onSearch={setSearch} status={action} onStatus={setAction} statuses={ACTIONS} />
      <PageStatus loading={loading} error={error} empty={!loading && !error && rows.length === 0} noun="audit log entries" onRetry={retry} />
      {!loading && !error && rows.length > 0 ? (
        <div className="esd-table-wrap">
          <table className="esd-table">
            <thead>
              <tr>
                <th>When</th>
                <th>Actor</th>
                <th>Action</th>
                <th>Entity</th>
                <th>Before</th>
                <th>After</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((entry) => (
                <tr key={entry.id}>
                  <td data-label="When">{entry.createdAt ? new Date(entry.createdAt).toLocaleString() : "—"}</td>
                  <td data-label="Actor">{entry.actorEmail || "—"}</td>
                  <td data-label="Action">{entry.action}</td>
                  <td data-label="Entity">{entry.entityType}{entry.entityId ? ` #${entry.entityId}` : ""}</td>
                  <td data-label="Before">{formatSnapshot(entry.before)}</td>
                  <td data-label="After">{formatSnapshot(entry.after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <PageNavigation hasPrevious={hasPreviousPage} hasNext={hasNextPage} onPrevious={previous} onNext={next} />
    </section>
  );
}
