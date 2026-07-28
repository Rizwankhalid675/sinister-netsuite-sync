import { useEffect, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Gate, useRole } from "../lib/useRole";
import { PERMISSIONS } from "../lib/rbac";
import "./dashboard.css";

const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
const RANGES = [
  { key: "7d", label: "7 days" },
  { key: "30d", label: "30 days" },
  { key: "90d", label: "90 days" },
  { key: "ytd", label: "Year to date" },
  { key: "all", label: "All time" },
];

function fmtMoney(v, currency = "USD") {
  if (v == null || isNaN(v)) return "—";
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v);
  } catch {
    return `$${Number(v).toFixed(2)}`;
  }
}
function fmtPercentValue(v) {
  if (v == null || !Number.isFinite(Number(v))) return "—";
  return `${Number(v).toFixed(1)}%`;
}
function fmtDelta(v) {
  if (v == null || isNaN(v)) return null;
  const pct = v * 100;
  const sign = pct > 0 ? "+" : "";
  return `${sign}${pct.toFixed(1)}%`;
}
function fmtDate(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "—";
  }
}

const easeOut = [0.16, 1, 0.3, 1];
const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: easeOut } },
};
const stagger = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06 } },
};

// Animated numeric count-up used across the hero KPI tiles.
function CountUp({ value, format }) {
  const reduced = useReducedMotion();
  const [display, setDisplay] = useState(reduced ? value : 0);
  useEffect(() => {
    if (value == null || isNaN(value)) {
      setDisplay(value);
      return;
    }
    if (reduced) {
      setDisplay(value);
      return;
    }
    let raf;
    const start = performance.now();
    const from = 0;
    const dur = 900;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (value - from) * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => raf && cancelAnimationFrame(raf);
  }, [value, reduced]);
  if (value == null || isNaN(value)) return <>—</>;
  return <>{format ? format(display) : Math.round(display)}</>;
}

function DeltaBadge({ value }) {
  const text = fmtDelta(value);
  if (text == null) return null;
  const positive = value > 0;
  const neutral = value === 0;
  return (
    <span
      className={`esd-delta ${neutral ? "esd-delta--flat" : positive ? "esd-delta--up" : "esd-delta--down"}`}
      aria-label={`Change ${text}`}
    >
      {neutral ? "•" : positive ? "▲" : "▼"} {text}
    </span>
  );
}

function SourceStatus({ dataSources }) {
  const mivaUnavailable = dataSources?.miva?.status === "unavailable";
  const mivaLive = dataSources?.miva?.status === "live";
  return (
    <div className="esd-source-status" role="status" aria-label="Connected data sources">
      <span className="esd-source-chip is-live"><span aria-hidden="true" />Development Shopify connected</span>
      {mivaLive && (
        <span className="esd-source-chip is-live"><span aria-hidden="true" />Miva data is live</span>
      )}
      {mivaUnavailable && (
        <span className="esd-source-chip is-muted"><span aria-hidden="true" />Miva data is not connected</span>
      )}
      <span className="esd-source-note">
        {mivaLive
          ? "Totals include synchronized Development Shopify and Miva records."
          : "Production reporting API is not connected."}
      </span>
    </div>
  );
}

function MetricTile({ label, value, helper, loading = false, tone = "default" }) {
  return (
    <motion.article className={`esd-kpi-card esd-kpi-card--${tone}`} variants={fadeUp}>
      <span className="esd-kpi-label">{label}</span>
      <span className="esd-kpi-value">{loading ? <span className="esd-skeleton" /> : value}</span>
      {helper ? <span className="esd-kpi-sub">{helper}</span> : null}
    </motion.article>
  );
}

function YearChevron({ direction }) {
  const points = direction === "previous" ? "15 18 9 12 15 6" : "9 6 15 12 9 18";
  return (
    <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true" focusable="false">
      <polyline points={points} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ActivityChart({ activity, year, currency, loading, onPreviousYear, onNextYear }) {
  const maxValue = Math.max(1, ...activity.map((month) => month.value || 0));
  return (
    <motion.section className="esd-card esd-chart-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: easeOut }}>
      <div className="esd-card-head">
        <div><p className="esd-section-kicker">Portfolio activity</p><h3>Protected value by month</h3></div>
        <div className="esd-year-nav">
          <button type="button" className="esd-btn esd-btn-icon" onClick={onPreviousYear} aria-label="Previous year"><YearChevron direction="previous" /></button>
          <span>{year}</span>
          <button type="button" className="esd-btn esd-btn-icon" onClick={onNextYear} disabled={year >= new Date().getFullYear()} aria-label="Next year"><YearChevron direction="next" /></button>
        </div>
      </div>
      <div className="esd-bar-chart" role="img" tabIndex="0" aria-label={`Order value by month for ${year}`}>
        <AnimatePresence mode="wait">
          <motion.div key={year} className="esd-bar-row" variants={stagger} initial="hidden" animate="show" exit={{ opacity: 0 }}>
            {MONTHS.map((label, index) => {
              const bucket = activity[index] || { orders: 0, value: 0 };
              const height = loading ? 0 : Math.max(2, (bucket.value / maxValue) * 100);
              return (
                <motion.div className="esd-bar-col" key={label} variants={fadeUp}>
                  <div className="esd-bar-track">
                    <motion.div className="esd-bar-fill" initial={{ height: 0 }} animate={{ height: `${height}%` }} transition={{ duration: 0.32, ease: easeOut }} title={`${label}: ${fmtMoney(bucket.value, currency)} (${bucket.orders} orders)`} />
                  </div>
                  <span className="esd-bar-label">{label}</span>
                </motion.div>
              );
            })}
          </motion.div>
        </AnimatePresence>
      </div>
    </motion.section>
  );
}

function HealthPanel({ title, summary, rows, tone = "default" }) {
  return (
    <motion.section className={`esd-card esd-stat-card esd-stat-card--${tone}`} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25, ease: easeOut }}>
      <div className="esd-health-head"><div><p className="esd-section-kicker">Operational health</p><h4>{title}</h4></div>{summary}</div>
      <ul className="esd-stat-list">{rows.map((row) => <li key={row.label}><span>{row.label}</span><strong>{row.value}</strong></li>)}</ul>
    </motion.section>
  );
}

function RecentOrders({ orders, currency, loading }) {
  return (
    <motion.section className="esd-card esd-table-card" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.28, ease: easeOut }}>
      <div className="esd-card-head">
        <div><p className="esd-section-kicker">Live operations</p><h3>Latest orders</h3></div>
        <Gate permission={PERMISSIONS.EXPORT_REPORTS} fallback={<span className="esd-locknote">Export requires staff access</span>}><button type="button" className="esd-btn esd-btn-sm" disabled>Export CSV</button></Gate>
      </div>
      <table className="esd-table">
        <thead><tr><th>Order</th><th>Date</th><th>Value</th><th>Protection</th><th>Status</th></tr></thead>
        <tbody>
          {loading && <tr><td colSpan={5} className="esd-empty">Loading…</td></tr>}
          {!loading && orders.length === 0 && <tr><td colSpan={5} className="esd-empty">No recent orders</td></tr>}
          {!loading && orders.map((order) => (
            <tr key={order.id}>
              <td data-label="Order"><strong>{order.name}</strong></td>
              <td data-label="Date">{fmtDate(order.createdAt)}</td>
              <td data-label="Value">{fmtMoney(order.value, currency)}</td>
              <td data-label="Protection"><span className={`esd-badge ${order.activeProtection ? "esd-badge-active" : "esd-badge-muted"}`}>{order.activeProtection ? "Protected" : order.protected ? "Requested" : "None"}</span></td>
              <td data-label="Status"><span className="esd-order-status"><span aria-hidden="true" />{order.fulfillmentStatus || order.financialStatus || "—"}</span></td>
            </tr>
          ))}
        </tbody>
      </table>
    </motion.section>
  );
}

function DashboardTab() {
  const { can, selectedShopId } = useRole();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [range, setRange] = useState("all");
  const [year, setYear] = useState(new Date().getFullYear());
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    setForbidden(false);
    const params = new URLSearchParams({ range, year: String(year) });
    if (selectedShopId) params.set("shopId", selectedShopId);
    fetch(`/api/dashboard-metrics?${params}`)
      .then(async (r) => {
        if (r.status === 403) {
          if (!cancelled) setForbidden(true);
          return null;
        }
        const body = await r.json().catch(() => ({}));
        if (!r.ok || !body.success) {
          throw new Error(body.error || "Failed to load dashboard data");
        }
        return body;
      })
      .then((body) => {
        if (cancelled || !body) return;
        setMetrics(body);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message || "Couldn't load dashboard data");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [range, year, selectedShopId, reloadKey]);

  const currency = metrics?.currency || "USD";
  const activity = metrics?.activity || [];
  const rangeLabel = RANGES.find((r) => r.key === range)?.label || range;

  if (forbidden) {
    return (
      <div className="esd-empty" role="alert">
        <p>You don&apos;t have permission to view this dashboard.</p>
      </div>
    );
  }

  return (
    <section className="esd-section esd-motion-dashboard" aria-label="Dashboard summary">
      {/* ---- Hero header ---- */}
      <motion.div
        className="esd-hero"
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: easeOut }}
      >
        <div>
          <p className="esd-hero-eyebrow">{metrics?.shop?.name || "Overview"}</p>
          <h2 className="esd-hero-title">Insurance operations</h2>
          <p className="esd-hero-sub">
            {metrics?.metrics?.status === "active" ? "Insurance active" : "Insurance inactive"} · Showing {rangeLabel.toLowerCase()}
          </p>
          <div className="esd-hero-metric">
            <span>Protected value</span>
            <strong>{loading ? "—" : fmtMoney(metrics?.metrics?.valueInTransit ?? 0, currency)}</strong>
            <small>{metrics?.insuranceMetrics?.protectedOrders ?? 0} protected orders in this period</small>
          </div>
        </div>
        <div className="esd-hero-controls">
          <div className="esd-range-toggle" role="group" aria-label="Time range">
            {RANGES.map((r) => (
              <button
                key={r.key}
                type="button"
                className={`esd-range-btn ${range === r.key ? "is-active" : ""}`}
                onClick={() => setRange(r.key)}
                aria-pressed={range === r.key}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="esd-btn esd-btn-ghost"
            onClick={() => setReloadKey((k) => k + 1)}
          >
            Refresh
          </button>
        </div>
      </motion.div>

      {error && (
        <motion.div
          className="esd-alert esd-alert-error"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          role="alert"
        >
          {error}
        </motion.div>
      )}

      {metrics?.metrics?.truncated && (
        <motion.div className="esd-alert esd-alert-warn" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
          Showing figures aggregated from the most recent 5,000 orders — some data may not be fully represented.
        </motion.div>
      )}

      {metrics && <SourceStatus dataSources={metrics.dataSources} />}

      {!loading && metrics?.metrics?.rangeOrders === 0 && (
        <div className="esd-range-empty" role="status">No records fall in this period. Choose All time to view the full history.</div>
      )}

      {/* ---- KPI grid ---- */}
      <motion.div
        className="esd-kpi-grid esd-kpi-strip"
        role="region"
        tabIndex="0"
        aria-label="Dashboard metrics"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <MetricTile label="Order revenue" loading={loading} value={<CountUp value={metrics?.revenueTrend?.revenue ?? 0} format={(value) => fmtMoney(value, currency)} />} helper={!loading && <DeltaBadge value={metrics?.revenueTrend?.revenueDelta} />} tone="teal" />
        <MetricTile label="Attach rate" loading={loading} value={fmtPercentValue(metrics?.insuranceMetrics?.attachRate)} helper={`${metrics?.insuranceMetrics?.protectedOrders ?? 0} protected orders`} />
        <MetricTile label="In transit" loading={loading} value={<CountUp value={metrics?.fulfillmentHealth?.inTransitOrders ?? 0} />} helper={fmtMoney(metrics?.metrics?.valueInTransit ?? 0, currency)} />
        <MetricTile label="Open claims" loading={loading} value={<CountUp value={metrics?.metrics?.openClaims ?? 0} />} helper={`Refund rate ${fmtPercentValue(metrics?.refundsReturns?.refundRate)}`} tone="claims" />
      </motion.div>

      <div className="esd-command-grid">
        <ActivityChart activity={activity} year={year} currency={currency} loading={loading} onPreviousYear={() => setYear((value) => value - 1)} onNextYear={() => setYear((value) => Math.min(value + 1, new Date().getFullYear()))} />
        <HealthPanel
          title="Claims health"
          tone="claims"
          summary={<span className="esd-health-score">{metrics?.metrics?.openClaims ?? 0}<small> open</small></span>}
          rows={[
            { label: "Refunded orders", value: metrics?.refundsReturns?.refundedOrders ?? "—" },
            { label: "Refunded amount", value: fmtMoney(metrics?.refundsReturns?.refundedAmount, currency) },
            { label: "Return rate", value: fmtPercentValue(metrics?.refundsReturns?.returnRate) },
          ]}
        />
      </div>

      {/* ---- Stat strip: fulfillment + refunds ---- */}
      <span className="esd-visually-hidden" role="status">Fulfillment status: {metrics?.fulfillmentHealth?.fulfilledOrders ?? 0} fulfilled, {metrics?.fulfillmentHealth?.inTransitOrders ?? 0} in transit, {metrics?.fulfillmentHealth?.cancelledOrders ?? 0} cancelled.</span>
      <div className="esd-stat-strip">
        <HealthPanel
          title="Fulfillment flow"
          summary={<span className="esd-health-score">{metrics?.fulfillmentHealth?.inTransitOrders ?? 0}<small> moving</small></span>}
          rows={[
            { label: "Fulfilled", value: metrics?.fulfillmentHealth?.fulfilledOrders ?? "—" },
            { label: "In transit", value: metrics?.fulfillmentHealth?.inTransitOrders ?? "—" },
            { label: "Cancelled", value: metrics?.fulfillmentHealth?.cancelledOrders ?? "—" },
          ]}
        />
        <HealthPanel
          title="Protection coverage"
          summary={<span className="esd-health-score">{fmtPercentValue(metrics?.insuranceMetrics?.attachRate)}</span>}
          rows={[
            { label: "Protected orders", value: metrics?.insuranceMetrics?.protectedOrders ?? "—" },
            { label: "Active protection", value: metrics?.metrics?.activeProtectedOrders ?? "—" },
            { label: "Order revenue", value: fmtMoney(metrics?.revenueTrend?.revenue, currency) },
          ]}
        />
      </div>

      {/* ---- Latest orders ---- */}
      <RecentOrders orders={metrics?.latestOrders || []} currency={currency} loading={loading} />
    </section>
  );
}

export function DashboardPage() {
  return (
    <Gate permission={PERMISSIONS.VIEW_DASHBOARD} fallback={
      <div className="esd-empty" role="alert">
        <p>You don&apos;t have permission to view this dashboard.</p>
      </div>
    }>
      <DashboardTab />
    </Gate>
  );
}

export default DashboardPage;
