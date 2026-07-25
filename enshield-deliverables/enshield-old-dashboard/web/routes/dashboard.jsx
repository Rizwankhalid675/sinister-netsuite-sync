import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Gate, useRole } from "../lib/useRole";
import { PERMISSIONS } from "../lib/rbac";
import "../dashboard.css";

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
function fmtPct(v) {
  if (v == null || isNaN(v)) return "—";
  return `${(v * 100).toFixed(1)}%`;
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

function DashboardTab() {
  const { can, selectedShopId } = useRole();
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [forbidden, setForbidden] = useState(false);
  const [range, setRange] = useState("30d");
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
  const maxValue = useMemo(
    () => Math.max(1, ...activity.map((m) => m.value || 0)),
    [activity]
  );
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
          <h2 className="esd-hero-title">Shipping protection performance</h2>
          <p className="esd-hero-sub">
            {metrics?.metrics?.status === "active" ? "Insurance active" : "Insurance inactive"} · Showing {rangeLabel.toLowerCase()}
          </p>
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

      {/* ---- KPI grid ---- */}
      <motion.div
        className="esd-kpi-grid"
        variants={stagger}
        initial="hidden"
        animate="show"
      >
        <motion.div className="esd-kpi-card" variants={fadeUp}>
          <span className="esd-kpi-label">Revenue</span>
          <span className="esd-kpi-value">
            {loading ? (
              <span className="esd-skeleton" />
            ) : (
              <CountUp value={metrics?.revenueTrend?.current ?? 0} format={(v) => fmtMoney(v, currency)} />
            )}
          </span>
          {!loading && <DeltaBadge value={metrics?.revenueTrend?.delta} />}
        </motion.div>

        <motion.div className="esd-kpi-card" variants={fadeUp}>
          <span className="esd-kpi-label">Protected orders</span>
          <span className="esd-kpi-value">
            {loading ? (
              <span className="esd-skeleton" />
            ) : (
              <CountUp value={metrics?.metrics?.rangeOrders?.protected ?? metrics?.metrics?.activeProtectedOrders ?? 0} />
            )}
          </span>
          {!loading && (
            <span className="esd-kpi-sub">
              {fmtPct(metrics?.insuranceMetrics?.attachRate)} attach rate
            </span>
          )}
        </motion.div>

        <motion.div className="esd-kpi-card" variants={fadeUp}>
          <span className="esd-kpi-label">Value in transit</span>
          <span className="esd-kpi-value">
            {loading ? (
              <span className="esd-skeleton" />
            ) : (
              <CountUp value={metrics?.metrics?.valueInTransit ?? 0} format={(v) => fmtMoney(v, currency)} />
            )}
          </span>
          <span className="esd-kpi-sub">
            {loading ? "" : `${metrics?.fulfillmentHealth?.inTransitOrders ?? 0} orders`}
          </span>
        </motion.div>

        <motion.div className="esd-kpi-card" variants={fadeUp}>
          <span className="esd-kpi-label">Open claims</span>
          <span className="esd-kpi-value">
            {loading ? <span className="esd-skeleton" /> : <CountUp value={metrics?.metrics?.openClaims ?? 0} />}
          </span>
          <span className="esd-kpi-sub">
            {loading ? "" : `Refund rate ${fmtPct(metrics?.refundsReturns?.refundRate)}`}
          </span>
        </motion.div>
      </motion.div>

      {/* ---- Activity chart ---- */}
      <motion.div
        className="esd-card esd-chart-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: easeOut, delay: 0.15 }}
      >
        <div className="esd-card-head">
          <h3>Monthly activity</h3>
          <div className="esd-year-nav">
            <button type="button" className="esd-btn esd-btn-icon" onClick={() => setYear((y) => y - 1)} aria-label="Previous year">
              ‹
            </button>
            <span>{year}</span>
            <button
              type="button"
              className="esd-btn esd-btn-icon"
              onClick={() => setYear((y) => Math.min(y + 1, new Date().getFullYear()))}
              disabled={year >= new Date().getFullYear()}
              aria-label="Next year"
            >
              ›
            </button>
          </div>
        </div>
        <div className="esd-bar-chart" role="img" aria-label={`Order value by month for ${year}`}>
          <AnimatePresence mode="wait">
            <motion.div
              key={year}
              className="esd-bar-row"
              variants={stagger}
              initial="hidden"
              animate="show"
              exit={{ opacity: 0 }}
            >
              {MONTHS.map((label, i) => {
                const bucket = activity[i] || { orders: 0, value: 0 };
                const pct = loading ? 0 : Math.max(2, (bucket.value / maxValue) * 100);
                return (
                  <motion.div className="esd-bar-col" key={label} variants={fadeUp}>
                    <div className="esd-bar-track">
                      <motion.div
                        className="esd-bar-fill"
                        initial={{ height: 0 }}
                        animate={{ height: `${pct}%` }}
                        transition={{ duration: 0.6, ease: easeOut }}
                        title={`${label}: ${fmtMoney(bucket.value, currency)} (${bucket.orders} orders)`}
                      />
                    </div>
                    <span className="esd-bar-label">{label}</span>
                  </motion.div>
                );
              })}
            </motion.div>
          </AnimatePresence>
        </div>
      </motion.div>

      {/* ---- Stat strip: fulfillment + refunds ---- */}
      <div className="esd-stat-strip">
        <motion.div
          className="esd-card esd-stat-card"
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: easeOut, delay: 0.2 }}
        >
          <h4>Fulfillment health</h4>
          <ul className="esd-stat-list">
            <li><span>Fulfilled</span><strong>{metrics?.fulfillmentHealth?.fulfilledOrders ?? "—"}</strong></li>
            <li><span>In transit</span><strong>{metrics?.fulfillmentHealth?.inTransitOrders ?? "—"}</strong></li>
            <li><span>Cancelled</span><strong>{metrics?.fulfillmentHealth?.cancelledOrders ?? "—"}</strong></li>
          </ul>
        </motion.div>
        <motion.div
          className="esd-card esd-stat-card"
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.45, ease: easeOut, delay: 0.25 }}
        >
          <h4>Refunds &amp; returns</h4>
          <ul className="esd-stat-list">
            <li><span>Refunded orders</span><strong>{metrics?.refundsReturns?.refundedOrders ?? "—"}</strong></li>
            <li><span>Refunded amount</span><strong>{fmtMoney(metrics?.refundsReturns?.refundedAmount, currency)}</strong></li>
            <li><span>Return rate</span><strong>{fmtPct(metrics?.refundsReturns?.returnRate)}</strong></li>
          </ul>
        </motion.div>
      </div>

      {/* ---- Latest orders ---- */}
      <motion.div
        className="esd-card esd-table-card"
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: easeOut, delay: 0.3 }}
      >
        <div className="esd-card-head">
          <h3>Latest orders</h3>
          <Gate permission={PERMISSIONS.EXPORT_REPORTS} fallback={<span className="esd-locknote">Export available to staff and admin roles</span>}>
            <button type="button" className="esd-btn esd-btn-sm" disabled>
              Export CSV
            </button>
          </Gate>
        </div>
        <table className="esd-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Date</th>
              <th>Value</th>
              <th>Protection</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr><td colSpan={5} className="esd-empty">Loading…</td></tr>
            )}
            {!loading && (metrics?.latestOrders || []).length === 0 && (
              <tr><td colSpan={5} className="esd-empty">No recent orders</td></tr>
            )}
            {!loading &&
              (metrics?.latestOrders || []).map((o) => (
                <tr key={o.id}>
                  <td data-label="Order">{o.name}</td>
                  <td data-label="Date">{fmtDate(o.createdAt)}</td>
                  <td data-label="Value">{fmtMoney(o.value, currency)}</td>
                  <td data-label="Protection">
                    <span className={`esd-badge ${o.activeProtection ? "esd-badge-active" : "esd-badge-muted"}`}>
                      {o.activeProtection ? "Protected" : o.protected ? "Requested" : "None"}
                    </span>
                  </td>
                  <td data-label="Status">{o.fulfillmentStatus || o.financialStatus || "—"}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </motion.div>
    </section>
  );
}

export default function DashboardPage() {
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
