import { useDeferredValue, useState } from "react";
import { Gate } from "../lib/useRole";
import { PERMISSIONS } from "../lib/rbac";
import { usePagedResource } from "../lib/usePagedResource";
import { ListToolbar, PageNavigation, PageStatus } from "../components/OperationalPage";
import "./dashboard.css";

export function UsersPage() {
  return <Gate permission={PERMISSIONS.VIEW_USERS} fallback={<div role="status" className="esd-empty">You don’t have permission to view users.</div>}><UsersInner /></Gate>;
}

function UsersInner() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const data = usePagedResource("/api/users", { search: useDeferredValue(search).trim(), status });
  return <section aria-label="Users and roles" aria-live="polite">
    <ListToolbar search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={["active", "invited", "deactivated"]} />
    <PageStatus loading={data.loading} error={data.error} empty={!data.rows.length} noun="users" onRetry={data.retry} />
    {!data.loading && !data.error && data.rows.length ? <div className="esd-table-wrap"><table className="esd-table">
      <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th>Created</th></tr></thead>
      <tbody>{data.rows.map((user) => <tr key={user.id}>
        <td data-label="Name">{user.name || "—"}</td><td data-label="Email">{user.email || "—"}</td>
        <td data-label="Role">{user.role?.name || "—"}</td><td data-label="Status">{user.status || "—"}</td>
        <td data-label="Last login">{user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "—"}</td>
        <td data-label="Created">{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</td>
      </tr>)}</tbody></table></div> : null}
    <PageNavigation hasPrevious={data.hasPreviousPage} hasNext={data.hasNextPage} onPrevious={data.previous} onNext={data.next} />
  </section>;
}
