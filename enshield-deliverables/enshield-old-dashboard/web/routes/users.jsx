import { useEffect, useMemo, useState } from "react";
import { Gate } from "../lib/useRole.jsx";
import { PERMISSIONS } from "../lib/rbac.js";
import { usePagedResource } from "../lib/usePagedResource.jsx";
import { ListToolbar, PageNavigation, PageStatus } from "../components/OperationalPage.jsx";
import "./dashboard.css";

const STATUSES = ["active", "suspended", "revoked"];

export function UsersPage() {
  return (
    <Gate
      permission={PERMISSIONS.VIEW_USERS}
      fallback={<div role="status" className="esd-empty">You don’t have permission to view users.</div>}
    >
      <UsersInner />
    </Gate>
  );
}

function useRoles() {
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/roles", { credentials: "include", signal: controller.signal })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok || !body.success) throw new Error(body.error || "Request failed");
        return body;
      })
      .then((body) => setRoles(body.roles || []))
      .catch((reason) => {
        if (reason.name !== "AbortError") setError(reason.message);
      });
    return () => controller.abort();
  }, []);
  return { roles, error };
}

function UsersInner() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const filters = useMemo(() => ({ search, status }), [search, status]);
  const { rows, loading, error, hasNextPage, hasPreviousPage, next, previous, retry } = usePagedResource(
    "/api/users",
    filters
  );
  const { roles } = useRoles();
  const roleLabelById = useMemo(() => {
    const map = new Map();
    for (const role of roles) map.set(role.id, role.name);
    return map;
  }, [roles]);

  return (
    <section aria-label="Users" aria-live="polite">
      <ListToolbar search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={STATUSES} />
      <PageStatus loading={loading} error={error} empty={!loading && !error && rows.length === 0} noun="users" onRetry={retry} />
      {!loading && !error && rows.length > 0 ? (
        <div className="esd-table-wrap">
          <table className="esd-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Shop</th>
                <th>Role</th>
                <th>Status</th>
                <th>Assigned</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((user) => (
                <tr key={user.id}>
                  <td data-label="Name">{user.name || "—"}</td>
                  <td data-label="Email">{user.email || "—"}</td>
                  <td data-label="Shop">{user.shop?.name || user.shop?.domain || "—"}</td>
                  <td data-label="Role">{user.role?.name || roleLabelById.get(user.role?.id) || "—"}</td>
                  <td data-label="Status">
                    <span className={`esd-badge esd-badge-${user.status}`}>{user.status}</span>
                  </td>
                  <td data-label="Assigned">{user.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}</td>
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
