import { useEffect, useState } from "react";
import { Gate, useRole } from "../lib/useRole";
import { PERMISSIONS } from "../lib/rbac";
import { downloadCsv } from "../lib/operationalData";
import "./dashboard.css";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function ReportsPage() {
  return <Gate permission={PERMISSIONS.VIEW_REPORTS} fallback={<div role="status" className="esd-empty">You don’t have permission to view reports.</div>}><ReportsInner /></Gate>;
}

function ReportsInner() {
  const [year, setYear] = useState(new Date().getFullYear());
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const { selectedShopId } = useRole();
  useEffect(() => {
    const controller = new AbortController();
    setReport(null); setError("");
    fetch(`/api/dashboard-metrics?year=${year}&range=all&shopId=${encodeURIComponent(selectedShopId)}`, { credentials: "include", signal: controller.signal })
      .then(async (response) => { const body = await response.json(); if (!response.ok || !body.success) throw new Error(body.error || "Request failed"); return body; })
      .then(setReport).catch((reason) => { if (reason.name !== "AbortError") setError(reason.message); });
    return () => controller.abort();
  }, [year, selectedShopId, reloadKey]);
  if (error) return <div className="esd-error" role="status" aria-live="polite">Couldn’t load report: {error} <button className="esd-link-button" type="button" onClick={() => setReloadKey((key) => key + 1)}>Try again</button></div>;
  if (!report) return <div className="esd-loading" role="status" aria-live="polite">Loading report…</div>;
  const rows = report.activity || [];
  const totalOrders = rows.reduce((sum, row) => sum + Number(row.orders || 0), 0);
  const totalValue = rows.reduce((sum, row) => sum + Number(row.value || 0), 0);
  const generatedAt = report.generatedAt || new Date().toISOString();
  const exportRows = [
    ["Generated at", generatedAt],
    ["Scope", report.scope],
    ["Client", report.scope === "assigned-shops" ? "All assigned clients" : report.shop?.name],
    ["Currency", report.currency || ""],
    ["Filters", `year=${year}; range=all`],
    ["Truncated", String(Boolean(report.metrics?.truncated))],
    ["Total orders", totalOrders],
    ["Total value", totalValue],
    [],
    ["Month", "Orders", "Value", "Currency", "Scope", "Client", "Generated at"],
    ...rows.map((row, index) => [
      MONTHS[index], row.orders || 0, row.value || 0, report.currency || "",
      report.scope, report.scope === "assigned-shops" ? "All assigned clients" : report.shop?.name,
      generatedAt,
    ]),
  ];
  return <section aria-label="Reports" aria-live="polite">
    <div className="esd-toolbar"><label>Year <input type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} /></label>
      <Gate permission={PERMISSIONS.EXPORT_REPORTS}><button className="esd-btn" type="button" onClick={() => downloadCsv(`enshield-report-${year}.csv`, exportRows)}>Export CSV</button></Gate>
    </div>
    <p className="esd-muted">As of {new Date(generatedAt).toLocaleString()} · {report.scope === "assigned-shops" ? "All assigned clients" : report.shop?.name} · Currency: {report.currency || "not available"} · Filters: year {year}, all time · Truncated: {report.metrics?.truncated ? "yes" : "no"}</p>
    <div className="esd-table-wrap"><table className="esd-table"><thead><tr><th>Month</th><th>Orders</th><th>Value</th></tr></thead>
      <tbody>{rows.map((row, index) => <tr key={MONTHS[index]}><td data-label="Month">{MONTHS[index]}</td><td data-label="Orders">{row.orders || 0}</td><td data-label="Value">{Number(row.value || 0).toFixed(2)}</td></tr>)}</tbody>
    </table></div>
  </section>;
}
