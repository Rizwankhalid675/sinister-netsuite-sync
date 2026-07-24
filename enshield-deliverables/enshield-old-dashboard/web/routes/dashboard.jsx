import { useEffect, useMemo, useState } from "react";
import { Gate, useRole } from "../lib/useRole";
import { PERMISSIONS } from "../lib/rbac";
import { Stagger, FadeInUp, MotionDiv } from "../components/Motion";
import { downloadCsv } from "../lib/operationalData";
import "./dashboard.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const fmtMoney = (n, currency = "USD") =>
  new Intl.NumberFormat(undefined, {
    style: "currency", currency, minimumFractionDigits: 2, maximumFractionDigits: 2,
  }).format(Number(n || 0));

const fmtDate = (iso) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB");
};

/**
 * Single-shop analytics dashboard — REVAMPED.
 *
 * - Modern layout + framer-motion animation (all motion isolated in ../components/Motion).
 * - RBAC: nav items, actions and reporting are gated by the current user's role
 *   (see ../lib/rbac + ../lib/useRole). Roles gate PRESENTATION/ACTIONS only;
 *   data tenancy is still enforced at the data layer by shopId .gelly filters.
 * - Real data only: metrics come from GET /api/dashboard-metrics. Claims remain
 *   "not yet tracked" (no claims model exists — never fabricated).
 */
export function DashboardPage() {
  return (
    <Gate permission={PERMISSIONS.VIEW_DASHBOARD} fallback={<div className="esd-empty">You don't have permission to view the dashboard.</div>}>
      <DashboardInner />
    </Gate>
  );
}

function DashboardInner() {
  // The role switcher is an admin-only TESTING override (preview another role's
  // grants locally). Only a user who can MANAGE_USERS sees it; it never widens
  // access beyond what the backend would grant that role.
  // Shop display info comes from the authenticated /api/dashboard-metrics route
  // (server-side, session-scoped) — no client-side unauthenticated shopifyShop read.
  const [year, setYear] = useState(new Date().getFullYear());
  const [range, setRange] = useState("30d");
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const { selectedShopId } = useRole();

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setForbidden(false);
    fetch(`/api/dashboard-metrics?year=${year}&range=${range}&shopId=${encodeURIComponent(selectedShopId)}`, { credentials: "include" })
      .then(async (response) => {
        const body = await response.json();
        if (response.status === 403) setForbidden(true);
        if (!response.ok) throw new Error(body.error || "Failed to load metrics");
        return body;
      })
      .then((json) => {
        if (cancelled) return;
        if (!json.success) throw new Error(json.error || "Failed to load metrics");
        setMetrics(json);
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [year, range, selectedShopId, reloadKey]);

  const activity = metrics?.activity ?? [];
  const maxValue = useMemo(
    () => Math.max(1, ...activity.map((a) => a.value || 0)),
    [activity]
  );

  const m = metrics?.metrics;
  const owner = metrics?.shop?.name || metrics?.shop?.domain || "Account";

  return (
    <>
      {error && <div className={forbidden ? "esd-empty" : "esd-error"} role="status" aria-live="polite">
        {forbidden ? "You don’t have permission to view this client." : `Couldn’t load dashboard data: ${error}`}
        {!forbidden ? <button className="esd-link-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>Try again</button> : null}
      </div>}
      <MotionDiv initial={{ opacity: 0 }} animate={{ opacity: 1 }} aria-label={`Dashboard for ${owner}`}>
        <DashboardTab {...{ activity, maxValue, loading, m, year, setYear, range, setRange, metrics }} />
      </MotionDiv>
    </>
  );

}

const RANGES = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "ytd", label: "Year to date" },
  { key: "all", label: "All time" },
];

const fmtPct = (n) => (n == null ? "—" : `${Number(n).toFixed(1)}%`);
const fmtDelta = (n) => {
  if (n == null) return null;
  const v = Number(n);
  const sign = v > 0 ? "▲" : v < 0 ? "▼" : "";
  const cls = v > 0 ? "esd-delta--up" : v < 0 ? "esd-delta--down" : "esd-delta--flat";
  return { text: `${sign} ${Math.abs(v).toFixed(1)}%`, cls };
};

function DeltaBadge({ value }) {
  const d = fmtDelta(value);
  if (!d) return <span className="esd-delta esd-delta--flat" title="No prior-period data">—</span>;
  return <span className={`esd-delta ${d.cls}`} title="vs previous period">{d.text}</span>;
}

function DashboardTab({ activity, maxValue, loading, m, year, setYear, range, setRange, metrics }) {
  const ins = metrics?.insuranceMetrics;
  const rr = metrics?.refundsReturns;
  const rt = metrics?.revenueTrend;
  const fh = metrics?.fulfillmentHealth;
  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? "30 days";
  const currency = metrics?.currency || "USD";

  return (
    <>
      <div className="esd-rangebar" role="group" aria-label="Metric time range">
        {RANGES.map((r) => (
          <button
            key={r.key}
            className={`esd-rangebtn ${range === r.key ? "esd-rangebtn--active" : ""}`}
            onClick={() => setRange(r.key)}
            aria-pressed={range === r.key}
          >
            {r.label}
          </button>
        ))}
      </div>

      <Stagger className="esd-metricgroups">
        <FadeInUp as="section" className="esd-card esd-mgroup">
          <div className="esd-mgroup-head">Revenue &amp; Orders <span className="esd-mgroup-range">{rangeLabel}</span></div>
          <div className="esd-mgroup-grid">
            <div className="esd-metric">
              <span className="esd-metric-label">Revenue</span>
              <span className="esd-metric-value">{loading ? "—" : fmtMoney(rt?.revenue, currency)}</span>
              {!loading && <DeltaBadge value={rt?.revenueDelta} />}
            </div>
            <div className="esd-metric">
              <span className="esd-metric-label">Avg order value</span>
              <span className="esd-metric-value">{loading ? "—" : fmtMoney(rt?.aov, currency)}</span>
              {!loading && <DeltaBadge value={rt?.aovDelta} />}
            </div>
            <div className="esd-metric">
              <span className="esd-metric-label">Orders</span>
              <span className="esd-metric-value">{loading ? "—" : rt?.orders ?? 0}</span>
              {!loading && <DeltaBadge value={rt?.ordersDelta} />}
            </div>
          </div>
        </FadeInUp>

        <FadeInUp as="section" className="esd-card esd-mgroup">
          <div className="esd-mgroup-head">Insurance <span className="esd-mgroup-range">{rangeLabel}</span></div>
          <div className="esd-mgroup-grid">
            <div className="esd-metric">
              <span className="esd-metric-label">Insurance revenue</span>
              <span className="esd-metric-value">{loading ? "—" : fmtMoney(ins?.revenue, currency)}</span>
            </div>
            <div className="esd-metric">
              <span className="esd-metric-label">Attach rate</span>
              <span className="esd-metric-value">{loading ? "—" : fmtPct(ins?.attachRate)}</span>
            </div>
            <div className="esd-metric">
              <span className="esd-metric-label">Protected orders</span>
              <span className="esd-metric-value">{loading ? "—" : ins?.protectedOrders ?? 0}</span>
            </div>
          </div>
        </FadeInUp>

        <FadeInUp as="section" className="esd-card esd-mgroup">
          <div className="esd-mgroup-head">Refunds &amp; Returns <span className="esd-mgroup-range">{rangeLabel}</span></div>
          <div className="esd-mgroup-grid">
            <div className="esd-metric">
              <span className="esd-metric-label">Refunded</span>
              <span className="esd-metric-value">{loading ? "—" : fmtMoney(rr?.refundedAmount, currency)}</span>
              <span className="esd-metric-sub">{loading ? "" : `${rr?.refundedOrders ?? 0} orders`}</span>
            </div>
            <div className="esd-metric">
              <span className="esd-metric-label">Refund rate</span>
              <span className="esd-metric-value">{loading ? "—" : fmtPct(rr?.refundRate)}</span>
            </div>
            <div className="esd-metric">
              <span className="esd-metric-label">Return rate</span>
              <span className="esd-metric-value">{loading ? "—" : fmtPct(rr?.returnRate)}</span>
              <span className="esd-metric-sub">{loading ? "" : `${rr?.returnedOrders ?? 0} orders`}</span>
            </div>
          </div>
        </FadeInUp>

        <FadeInUp as="section" className="esd-card esd-mgroup">
          <div className="esd-mgroup-head">Fulfillment <span className="esd-mgroup-range">{rangeLabel}</span></div>
          <div className="esd-mgroup-grid">
            <div className="esd-metric">
              <span className="esd-metric-label">Fulfillment rate</span>
              <span className="esd-metric-value">{loading ? "—" : fmtPct(fh?.fulfillmentRate)}</span>
              <span className="esd-metric-sub">{loading ? "" : `${fh?.fulfilledOrders ?? 0} fulfilled`}</span>
            </div>
            <div className="esd-metric">
              <span className="esd-metric-label">In transit</span>
              <span className="esd-metric-value">{loading ? "—" : fh?.inTransitOrders ?? 0}</span>
            </div>
            <div className="esd-metric">
              <span className="esd-metric-label">Cancel rate</span>
              <span className="esd-metric-value">{loading ? "—" : fmtPct(fh?.cancelRate)}</span>
              <span className="esd-metric-sub">{loading ? "" : `${fh?.cancelledOrders ?? 0} cancelled`}</span>
            </div>
          </div>
        </FadeInUp>
      </Stagger>

      <Stagger className="esd-grid">
        <FadeInUp as="section" className="esd-card esd-chartcard">
          <div className="esd-chart-head">
            <div className="esd-year">
              <button className="esd-yearbtn" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">◄</button>
              <span>{year}</span>
              <button className="esd-yearbtn" onClick={() => setYear((y) => y + 1)} aria-label="Next year">►</button>
            </div>
            <div className="esd-yearly">Yearly ▾</div>
          </div>
          <div className="esd-chart" role="img" aria-label={`Order value by month for ${year}`}>
            {(activity.length ? activity : MONTHS.map((_, i) => ({ month: i, value: 0 }))).map((b, i) => (
              <div className="esd-bar-col" key={i}>
                <MotionDiv
                  className="esd-bar"
                  initial={{ height: "2%" }}
                  animate={{ height: loading ? "4%" : `${Math.max(2, ((b.value || 0) / maxValue) * 100)}%` }}
                  transition={{ duration: 0.6, delay: i * 0.03, ease: [0.22, 1, 0.36, 1] }}
                  title={fmtMoney(b.value, currency)}
                />
                <span className="esd-bar-label">{MONTHS[i]}</span>
              </div>
            ))}
          </div>
          <table className="esd-visually-hidden">
            <caption>Order value by month for {year}</caption>
            <thead><tr><th>Month</th><th>Orders</th><th>Value</th></tr></thead>
            <tbody>{activity.map((row, index) => (
              <tr key={MONTHS[index]}><td>{MONTHS[index]}</td><td>{row.orders || 0}</td><td>{fmtMoney(row.value, currency)}</td></tr>
            ))}</tbody>
          </table>
        </FadeInUp>

        <aside className="esd-stats" aria-label="Dashboard summary">
          <FadeInUp className="esd-card esd-stat esd-stat--outline">
            <div className="esd-stat-label">PROTECTED ORDERS</div>
            <div className="esd-stat-value esd-teal">{loading ? "—" : m?.protectedOrders ?? 0}</div>
          </FadeInUp>
          <FadeInUp className="esd-card esd-stat esd-stat--dark">
            <div className="esd-stat-label">VALUE IN TRANSIT</div>
            <div className="esd-stat-value">{loading ? "—" : fmtMoney(m?.valueInTransit, currency)}</div>
            {m && m.truncated && (
              <div className="esd-stat-note" title="Aggregated from the most recent 5,000 orders">most recent 5,000 orders</div>
            )}
          </FadeInUp>
          <FadeInUp className="esd-card esd-stat esd-stat--outline">
            <div className="esd-stat-label">OPEN CLAIMS</div>
            <div className="esd-stat-value esd-teal">{loading ? "—" : m?.openClaims ?? 0}</div>
            {m && m.openClaimsAvailable === false && (
              <div className="esd-stat-note" title="No claims data model exists yet">not yet tracked</div>
            )}
          </FadeInUp>
        </aside>
      </Stagger>

      <OrdersTable metrics={metrics} loading={loading} title="Latest Orders" />
    </>
  );
}

function ReportsTab({ metrics, m, loading, activity, year }) {
  const totalValue = useMemo(
    () => activity.reduce((s, b) => s + (b.value || 0), 0),
    [activity]
  );
  const protectedRate =
    m && m.totalOrders ? Math.round((m.protectedOrders / m.totalOrders) * 100) : 0;

  return (
    <Stagger className="esd-report">
      <FadeInUp className="esd-card esd-report-summary">
        <h2 className="esd-table-title">Report — {year}</h2>
        <div className="esd-report-metrics">
          <div><span className="esd-stat-label">TOTAL ORDER VALUE</span><strong>{loading ? "—" : fmtMoney(totalValue)}</strong></div>
          <div><span className="esd-stat-label">TOTAL ORDERS</span><strong>{loading ? "—" : m?.totalOrders ?? 0}</strong></div>
          <div><span className="esd-stat-label">PROTECTED ORDERS</span><strong>{loading ? "—" : m?.protectedOrders ?? 0}</strong></div>
          <div><span className="esd-stat-label">PROTECTION RATE</span><strong>{loading ? "—" : `${protectedRate}%`}</strong></div>
        </div>
        <p className="esd-report-note">
          Claims-based reporting is <em>not yet tracked</em> — no claims data model exists.
          These figures are derived from real order data only.
        </p>
      </FadeInUp>

      <Gate permission={PERMISSIONS.EXPORT_REPORTS} fallback={
        <FadeInUp className="esd-card esd-locknote">Export is available to Staff and Admin roles.</FadeInUp>
      }>
        <FadeInUp className="esd-card esd-report-actions">
          <button className="esd-btn" onClick={() => exportCsv(metrics)}>Export CSV</button>
          <span className="esd-muted">Exports the {year} monthly breakdown (real data).</span>
        </FadeInUp>
      </Gate>

      <FadeInUp className="esd-card esd-tablecard">
        <h2 className="esd-table-title">Monthly breakdown</h2>
        <table className="esd-table">
          <thead><tr><th>MONTH</th><th>ORDERS</th><th>VALUE</th></tr></thead>
          <tbody>
            {activity.map((b, i) => (
              <tr key={i}><td>{MONTHS[i]}</td><td>{b.orders || 0}</td><td>{fmtMoney(b.value)}</td></tr>
            ))}
          </tbody>
        </table>
      </FadeInUp>
    </Stagger>
  );
}

function OrdersTab({ metrics, loading }) {
  return <OrdersTable metrics={metrics} loading={loading} title="Orders" />;
}

function SettingsTab({ m }) {
  return (
    <Stagger className="esd-report">
      <FadeInUp className="esd-card">
        <h2 className="esd-table-title">Protection settings</h2>
        <div className="esd-report-metrics">
          <div><span className="esd-stat-label">STATUS</span><strong>{m?.status ?? "—"}</strong></div>
          <div><span className="esd-stat-label">INSURANCE RATE</span><strong>{m?.insuranceRate ?? "—"}</strong></div>
        </div>
        <Gate
          permission={PERMISSIONS.MANAGE_STOREFRONT_CONFIGURATION}
          fallback={<p className="esd-locknote">You have read-only access. Editing settings requires an Admin role.</p>}
        >
          <div className="esd-report-actions">
            <button className="esd-btn" disabled title="Wired to the real settings action">Edit protection config</button>
            <span className="esd-muted">Admin-only. Enabled once wired to the settings action.</span>
          </div>
        </Gate>
      </FadeInUp>
    </Stagger>
  );
}

function OrdersTable({ metrics, loading, title }) {
  return (
    <FadeInUp as="section" className="esd-card esd-tablecard">
      <h2 className="esd-table-title">{title}</h2>
      <table className="esd-table">
        <thead>
          <tr><th>ORDER</th><th>VALUE</th><th>PROTECTED</th><th>STATUS</th><th>CREATED</th></tr>
        </thead>
        <tbody>
          {loading && <tr><td colSpan={5} className="esd-empty">Loading…</td></tr>}
          {!loading && (metrics?.latestOrders?.length ? metrics.latestOrders : []).map((o) => (
            <tr key={o.id}>
              <td data-label="Order" className="esd-teal esd-order-name">{o.name}</td>
              <td data-label="Value">{fmtMoney(o.value, metrics?.currency || "USD")}</td>
              <td data-label="Protected">{o.protected ? "Yes" : "—"}</td>
              <td data-label="Status">
                <span
                  className={`esd-dot ${o.fulfillmentStatus === "fulfilled" ? "esd-dot--green" : "esd-dot--amber"}`}
                  title={o.fulfillmentStatus || o.financialStatus || "unknown"}
                />
                <span className="esd-status-text">
                  <span className="esd-visually-hidden">Status: </span>
                  {o.fulfillmentStatus || o.financialStatus || "unknown"}
                </span>
              </td>
              <td data-label="Created">{fmtDate(o.createdAt)}</td>
            </tr>
          ))}
          {!loading && !(metrics?.latestOrders?.length) && (
            <tr><td colSpan={5} className="esd-empty">No orders yet.</td></tr>
          )}
        </tbody>
      </table>
    </FadeInUp>
  );
}

function exportCsv(metrics) {
  const rows = [["Month", "Orders", "Value"]];
  (metrics?.activity ?? []).forEach((b, i) => rows.push([MONTHS[i], b.orders || 0, b.value || 0]));
  downloadCsv(`enshield-report-${metrics?.year ?? ""}.csv`, rows);
}
