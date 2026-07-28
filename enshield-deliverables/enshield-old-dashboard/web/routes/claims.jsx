import { useDeferredValue, useState } from "react";
import { Gate, useRole } from "../lib/useRole";
import { PERMISSIONS } from "../lib/rbac";
import { usePagedResource } from "../lib/usePagedResource";
import { ListToolbar, PageNavigation, PageStatus } from "../components/OperationalPage";
import "./dashboard.css";

const STATUSES = ["Draft", "Submitted", "New", "Under Review", "Awaiting Customer", "Awaiting Merchant", "Awaiting Carrier", "Approved", "Partially Approved", "Denied", "Payment Pending", "Paid", "Closed", "Reopened", "Cancelled"];
const money = (minor, amount, currency = "USD") => new Intl.NumberFormat(undefined, { style: "currency", currency }).format(minor != null ? Number(minor) / 100 : Number(amount || 0));

// Mirror of api/lib/claimStateMachine.js CLAIM_TRANSITIONS — presentation only.
// The server re-validates every transition; this just avoids offering illegal
// moves in the UI. Payment/approval statuses are further gated by permission.
const CLAIM_TRANSITIONS = {
  Draft: ["Submitted", "Cancelled"],
  Submitted: ["New", "Cancelled"],
  New: ["Under Review", "Cancelled"],
  "Under Review": ["Awaiting Customer", "Awaiting Merchant", "Awaiting Carrier", "Approved", "Partially Approved", "Denied", "Cancelled"],
  "Awaiting Customer": ["Under Review", "Cancelled"],
  "Awaiting Merchant": ["Under Review", "Cancelled"],
  "Awaiting Carrier": ["Under Review", "Cancelled"],
  Approved: ["Payment Pending", "Reopened"],
  "Partially Approved": ["Payment Pending", "Reopened"],
  Denied: ["Reopened", "Closed"],
  "Payment Pending": ["Paid"],
  Paid: ["Closed"],
  Closed: ["Reopened"],
  Reopened: ["Under Review", "Cancelled"],
  Cancelled: [],
};
const APPROVAL_STATUSES = new Set(["Approved", "Partially Approved", "Denied"]);
const PAYMENT_STATUSES = new Set(["Payment Pending", "Paid"]);

function permissionForTransition(toStatus) {
  if (PAYMENT_STATUSES.has(toStatus)) return PERMISSIONS.PAY_CLAIMS;
  if (APPROVAL_STATUSES.has(toStatus)) return PERMISSIONS.APPROVE_CLAIMS;
  return PERMISSIONS.EDIT_CLAIMS;
}

export function ClaimsPage() {
  return <Gate permission={PERMISSIONS.VIEW_CLAIMS} fallback={<div role="status" className="esd-empty">You don’t have permission to view claims.</div>}><ClaimsInner /></Gate>;
}

function ClaimsInner() {
  const { can } = useRole();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const data = usePagedResource("/api/claims", { search: useDeferredValue(search).trim(), status });
  const [busyId, setBusyId] = useState(null);
  const [rowError, setRowError] = useState({});

  const transition = async (claim, toStatus) => {
    setRowError((prev) => ({ ...prev, [claim.id]: "" }));
    setBusyId(claim.id);
    try {
      const response = await fetch(`/api/claims/${claim.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: toStatus }),
      });
      const body = await response.json();
      if (!response.ok || !body.success) throw new Error(body.error || "Transition failed");
      data.retry();
    } catch (reason) {
      setRowError((prev) => ({ ...prev, [claim.id]: reason.message }));
    } finally {
      setBusyId(null);
    }
  };

  return <section aria-label="Claims" aria-live="polite">
    <ListToolbar search={search} onSearch={setSearch} status={status} onStatus={setStatus} statuses={STATUSES} />
    <PageStatus loading={data.loading} error={data.error} empty={!data.rows.length} noun="claims" onRetry={data.retry} />
    {!data.loading && !data.error && data.rows.length ? <div className="esd-table-wrap"><table className="esd-table">
      <thead><tr><th>Order</th><th>Store</th><th>Reason</th><th>Status</th><th>Claim value</th><th>Order value</th><th>Created</th><th>Actions</th></tr></thead>
      <tbody>{data.rows.map((claim) => {
        const nextStatuses = (CLAIM_TRANSITIONS[claim.status] || []).filter((toStatus) => can(permissionForTransition(toStatus)));
        return <tr key={claim.id}>
          <td data-label="Order">{claim.order?.name || "—"}</td><td data-label="Store">{claim.client?.storeName || "—"}</td>
          <td data-label="Reason">{claim.reason || "—"}{claim.readOnly ? <span className="esd-badge esd-badge-source">Legacy · read only</span> : null}</td><td data-label="Status"><span className={`esd-badge esd-badge-${(claim.status || "").toLowerCase().replace(/\s+/g, "-")}`}>{claim.status || "—"}</span></td>
          <td data-label="Claim value">{money(claim.claimValueMinor, claim.claimValue, claim.claimCurrency)}</td>
          <td data-label="Order value">{money(claim.orderValueMinor, claim.orderValue, claim.orderCurrency)}</td>
          <td data-label="Created">{claim.createdAt ? new Date(claim.createdAt).toLocaleDateString() : "—"}</td>
          <td data-label="Actions">
            {!claim.readOnly && nextStatuses.length ? <div className="esd-row-actions">
              {nextStatuses.map((toStatus) => (
                <button
                  key={toStatus}
                  type="button"
                  className="esd-btn esd-btn-sm"
                  disabled={busyId === claim.id}
                  onClick={() => transition(claim, toStatus)}
                >
                  {busyId === claim.id ? "Working…" : toStatus}
                </button>
              ))}
            </div> : <span className="esd-visually-hidden">No actions available</span>}
            {rowError[claim.id] ? <p className="esd-field-error" role="alert">{rowError[claim.id]}</p> : null}
          </td>
        </tr>;
      })}</tbody></table></div> : null}
    <PageNavigation hasPrevious={data.hasPreviousPage} hasNext={data.hasNextPage} onPrevious={data.previous} onNext={data.next} />
  </section>;
}
