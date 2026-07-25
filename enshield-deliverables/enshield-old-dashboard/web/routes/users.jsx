import { useEffect, useMemo, useState } from "react";
import { Gate, useRole } from "../lib/useRole.jsx";
import { PERMISSIONS } from "../lib/rbac.js";
import { usePagedResource } from "../lib/usePagedResource.jsx";
import { ListToolbar, PageNavigation, PageStatus } from "../components/OperationalPage.jsx";
import "./dashboard.css";

const STATUSES = ["active", "invited", "deactivated"];

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
  const { can } = useRole();
  const canManage = can(PERMISSIONS.MANAGE_USERS);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const filters = useMemo(() => ({ search, status }), [search, status]);
  const { rows, loading, error, hasNextPage, hasPreviousPage, next, previous, retry } = usePagedResource("/api/users", filters);
  const { roles } = useRoles();
  const roleLabelById = useMemo(() => {
    const map = new Map();
    for (const role of roles) map.set(role.id, role.name);
    return map;
  }, [roles]);

  const [modal, setModal] = useState(null); // { mode: "create" | "edit", user? }
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState("");

  const closeModal = () => setModal(null);

  const handleSaved = () => {
    closeModal();
    retry();
  };

  const handleDeactivate = async (user) => {
    if (!window.confirm(`Deactivate ${user.name || user.email}? They will lose dashboard access.`)) return;
    setBusyId(user.id);
    setRowError("");
    try {
      const response = await fetch(`/api/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "deactivated" }),
      });
      const responseBody = await response.json();
      if (!response.ok || !responseBody.success) throw new Error(responseBody.error || "Request failed");
      retry();
    } catch (reason) {
      setRowError(reason.message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section aria-label="Users and roles" aria-live="polite">
      <div className="esd-toolbar-row">
        <ListToolbar search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={STATUSES} />
        {canManage ? (
          <button className="esd-btn esd-btn-sm" type="button" onClick={() => setModal({ mode: "create" })}>
            + Create user
          </button>
        ) : null}
      </div>
      {rowError ? <div className="esd-form-error" role="alert">{rowError}</div> : null}
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
                {canManage ? <th>Actions</th> : null}
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
                  {canManage ? (
                    <td data-label="Actions">
                      <div className="esd-row-actions">
                        <button
                          className="esd-btn esd-btn-sm esd-btn-outline"
                          type="button"
                          onClick={() => setModal({ mode: "edit", user })}
                        >
                          Edit
                        </button>
                        {user.status !== "deactivated" ? (
                          <button
                            className="esd-btn esd-btn-sm esd-btn-danger"
                            type="button"
                            disabled={busyId === user.id}
                            onClick={() => handleDeactivate(user)}
                          >
                            {busyId === user.id ? "Deactivating…" : "Deactivate"}
                          </button>
                        ) : null}
                      </div>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
      <PageNavigation hasPrevious={hasPreviousPage} hasNext={hasNextPage} onPrevious={previous} onNext={next} />
      {modal ? (
        <UserFormModal mode={modal.mode} user={modal.user} roles={roles} onClose={closeModal} onSaved={handleSaved} />
      ) : null}
    </section>
  );
}

function UserFormModal({ mode, user, roles, onClose, onSaved }) {
  const isEdit = mode === "edit";
  const [name, setName] = useState(user?.name || "");
  const [email, setEmail] = useState(user?.email || "");
  const [personId, setPersonId] = useState("");
  const [roleId, setRoleId] = useState(user?.role?.id || "");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState("");

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const handleSubmit = async (event) => {
    event.preventDefault();
    setFormError("");
    if (!name.trim()) return setFormError("Name is required.");
    if (!isEdit && !email.trim()) return setFormError("Email is required.");
    if (!isEdit && !personId.trim()) return setFormError("Person ID is required.");
    if (!roleId) return setFormError("Role is required.");

    setSubmitting(true);
    try {
      const url = isEdit ? `/api/users/${encodeURIComponent(user.id)}` : "/api/users";
      const method = isEdit ? "PATCH" : "POST";
      const payload = isEdit
        ? { name: name.trim(), role: roleId }
        : { name: name.trim(), email: email.trim(), personId: personId.trim(), role: roleId };
      const response = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const responseBody = await response.json();
      if (!response.ok || !responseBody.success) throw new Error(responseBody.error || "Request failed");
      onSaved();
    } catch (reason) {
      setFormError(reason.message);
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
        aria-labelledby="esd-user-modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 className="esd-modal-title" id="esd-user-modal-title">
          {isEdit ? "Edit user" : "Create user"}
        </h2>
        <form className="esd-form" onSubmit={handleSubmit}>
          {formError ? <div className="esd-form-error" role="alert">{formError}</div> : null}
          <div className="esd-field">
            <label htmlFor="esd-user-name">Name</label>
            <input id="esd-user-name" type="text" value={name} onChange={(event) => setName(event.target.value)} required />
          </div>
          {!isEdit ? (
            <>
              <div className="esd-field">
                <label htmlFor="esd-user-email">Email</label>
                <input
                  id="esd-user-email"
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  required
                />
              </div>
              <div className="esd-field">
                <label htmlFor="esd-user-personid">Person ID</label>
                <input
                  id="esd-user-personid"
                  type="text"
                  value={personId}
                  onChange={(event) => setPersonId(event.target.value)}
                  placeholder="Shopify staff / person identifier"
                  required
                />
              </div>
            </>
          ) : (
            <div className="esd-field">
              <label>Email</label>
              <input type="email" value={email} disabled />
            </div>
          )}
          <div className="esd-field">
            <label htmlFor="esd-user-role">Role</label>
            <select id="esd-user-role" value={roleId} onChange={(event) => setRoleId(event.target.value)} required>
              <option value="">Select a role</option>
              {roles.map((role) => (
                <option key={role.id} value={role.id}>
                  {role.name}
                </option>
              ))}
            </select>
          </div>
          <div className="esd-modal-actions">
            <button className="esd-btn esd-btn-secondary" type="button" onClick={onClose} disabled={submitting}>
              Cancel
            </button>
            <button className="esd-btn" type="submit" disabled={submitting}>
              {submitting ? "Saving…" : isEdit ? "Save changes" : "Create user"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
