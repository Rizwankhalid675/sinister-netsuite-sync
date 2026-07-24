import { useEffect, useState } from "react";
import { Gate, useRole } from "../lib/useRole";
import { PERMISSIONS } from "../lib/rbac";
import { downloadCsv } from "../lib/operationalData";
import "./dashboard.css";

const AREAS = Object.freeze([
  ["overview", "Overview"], ["ledger", "Ledger"], ["receivables", "Receivables"],
  ["payables", "Payables"], ["reserves", "Claim reserves"], ["payments", "Payment register"],
  ["reconciliation", "Reconciliation"], ["reports", "Reports"], ["audit", "Audit"],
]);
const REPORTS = Object.freeze([
  ["trial_balance", "Trial balance"], ["ledger_detail", "Ledger detail"],
  ["ar_ageing", "AR ageing"], ["ap_ageing", "AP ageing"],
  ["reserve_roll_forward", "Reserve roll-forward"], ["payment_register", "Payment register"],
  ["reconciliation_exceptions", "Reconciliation exceptions"], ["audit_export", "Audit export"],
]);
const REPORT_COLUMNS = Object.freeze({
  trial_balance: [["accountCode", "Account"], ["currency", "Currency"], ["debitMinor", "Debit", "money"], ["creditMinor", "Credit", "money"], ["balanceMinor", "Balance", "money"]],
  ledger_detail: [["accountCode", "Account"], ["currency", "Currency"], ["debitMinor", "Debit", "money"], ["creditMinor", "Credit", "money"], ["accountingDate", "Accounting date"]],
  ar_ageing: [["currency", "Currency"], ["currentMinor", "Current", "money"], ["days1To30Minor", "1–30 days", "money"], ["days31To60Minor", "31–60 days", "money"], ["days61To90Minor", "61–90 days", "money"], ["over90Minor", "Over 90 days", "money"]],
  ap_ageing: [["currency", "Currency"], ["currentMinor", "Current", "money"], ["days1To30Minor", "1–30 days", "money"], ["days31To60Minor", "31–60 days", "money"], ["days61To90Minor", "61–90 days", "money"], ["over90Minor", "Over 90 days", "money"]],
  reserve_roll_forward: [["currency", "Currency"], ["openingMinor", "Opening", "money"], ["additionsMinor", "Additions", "money"], ["releasesMinor", "Releases", "money"], ["paymentsMinor", "Payments", "money"], ["closingMinor", "Closing", "money"]],
  payment_register: [["externalReference", "Reference"], ["currency", "Currency"], ["amountMinor", "Amount", "money"], ["createdAt", "Recorded"]],
  reconciliation_exceptions: [["externalReference", "Reference"], ["currency", "Currency"], ["amountMinor", "Amount", "money"], ["status", "Status"]],
  audit_export: [["action", "Action"], ["entityType", "Entity type"], ["entityId", "Entity ID"], ["createdAt", "Created"]],
});
const WORKSPACE_COLUMNS = Object.freeze({
  ledger: [["sourceId", "Source"], ["status", "Status"], ["currency", "Currency"], ["createdAt", "Created"]],
  receivables: [["documentNumber", "Document"], ["status", "Status"], ["currency", "Currency"], ["amountMinor", "Amount", "money"], ["openAmountMinor", "Open", "money"], ["dueAt", "Due"]],
  payables: [["documentNumber", "Document"], ["status", "Status"], ["currency", "Currency"], ["amountMinor", "Amount", "money"], ["openAmountMinor", "Open", "money"], ["dueAt", "Due"]],
  reserves: [["currency", "Currency"], ["openingMinor", "Opening", "money"], ["additionsMinor", "Additions", "money"], ["releasesMinor", "Releases", "money"], ["paymentsMinor", "Payments", "money"], ["closingMinor", "Closing", "money"]],
  payments: [["externalReference", "Reference"], ["status", "Status"], ["currency", "Currency"], ["amountMinor", "Amount", "money"], ["recordedById", "Recorded by"], ["verifiedById", "Verified by"], ["createdAt", "Recorded"]],
  reconciliation: [["externalReference", "Reference"], ["currency", "Currency"], ["amountMinor", "Amount", "money"], ["status", "Status"]],
  audit: [["action", "Action"], ["entityType", "Entity type"], ["entityId", "Entity ID"], ["createdAt", "Created"]],
});
const MAX_RECONCILIATION_CSV_BYTES = 2_000_000;

function money(minor, currency = "USD") {
  if (!Number.isInteger(Number(minor))) return "—";
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(Number(minor) / 100);
  } catch {
    return `${currency} ${(Number(minor) / 100).toFixed(2)}`;
  }
}

async function requestJson(url, options) {
  const response = await fetch(url, { credentials: "include", ...options });
  const body = await response.json();
  if (!response.ok || !body.success) throw new Error(body.error || "Request failed");
  return body;
}

function readFileText(file) {
  if (typeof file.text === "function") return file.text();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Couldn’t read the selected file"));
    reader.readAsText(file);
  });
}

export function FinancePage() {
  return <Gate permission={PERMISSIONS.VIEW_FINANCE} fallback={<div role="status" className="esd-empty">You don’t have permission to view finance.</div>}><FinanceInner /></Gate>;
}

function FinanceInner() {
  const { selectedShopId, clients, can } = useRole();
  const selectedClient = clients?.find((client) => String(client.shopId) === String(selectedShopId));
  const assignedEntities = selectedClient?.accountingEntities?.length
    ? selectedClient.accountingEntities
    : selectedClient?.accountingEntityId
      ? [{ id: selectedClient.accountingEntityId, name: selectedClient.accountingEntityName || selectedClient.name }]
      : [];
  const suggestedEntity = selectedClient?.accountingEntityId || assignedEntities[0]?.id || "";
  const [entityId, setEntityId] = useState(suggestedEntity);
  const [area, setArea] = useState("overview");
  const [reportType, setReportType] = useState("trial_balance");
  const [reportFrom, setReportFrom] = useState("");
  const [reportTo, setReportTo] = useState("");
  const [reportAsOf, setReportAsOf] = useState("");
  const [reload, setReload] = useState(0);
  const [state, setState] = useState({ status: "idle", records: [], runs: [], error: "" });
  const [notice, setNotice] = useState("");
  const [form, setForm] = useState(null);
  const [reconciliationCsv, setReconciliationCsv] = useState("");
  const [reconciliationError, setReconciliationError] = useState("");
  const editable = can(PERMISSIONS.EDIT_FINANCE);
  const queryArea = area === "overview" || area === "reports" ? "ledger" : area;

  useEffect(() => setEntityId(suggestedEntity), [selectedShopId, suggestedEntity]);
  useEffect(() => {
    if (!entityId || !selectedShopId || selectedShopId === "all") {
      setState({ status: "idle", records: [], runs: [], error: "" });
      return undefined;
    }
    const controller = new AbortController();
    setState({ status: "loading", records: [], runs: [], error: "" });
    const params = new URLSearchParams({ shopId: selectedShopId, accountingEntityId: entityId });
    const reportParams = {
      ...Object.fromEntries(params), reportType,
      ...(reportFrom ? { from: reportFrom } : {}),
      ...(reportTo ? { to: reportTo } : {}),
      ...(reportAsOf ? { asOf: reportAsOf } : {}),
    };
    const endpoint = area === "reports"
      ? `/api/finance-reports?${new URLSearchParams(reportParams)}`
      : `/api/finance-workspace?${new URLSearchParams({ ...Object.fromEntries(params), section: queryArea, first: "50" })}`;
    requestJson(endpoint, { signal: controller.signal })
      .then((body) => setState({ status: "ready", records: body.records || body.rows || [], runs: body.reconciliationRuns || [], error: "" }))
      .catch((error) => {
        if (error.name !== "AbortError") setState({ status: "error", records: [], runs: [], error: error.message });
      });
    return () => controller.abort();
  }, [selectedShopId, entityId, queryArea, area, reportType, reportFrom, reportTo, reportAsOf, reload]);

  const columns = area === "reports"
    ? REPORT_COLUMNS[reportType]
    : WORKSPACE_COLUMNS[queryArea] || [["id", "ID"], ["status", "Status"]];

  async function mutate(payload) {
    setNotice("");
    try {
      await requestJson("/api/finance-operations", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ shopId: selectedShopId, accountingEntityId: entityId, ...payload }),
      });
      setNotice("Saved in shadow mode. No funds were moved.");
      setForm(null);
      setReload((value) => value + 1);
    } catch (error) {
      setNotice(`Couldn’t save: ${error.message}`);
    }
  }

  function openDocument(kind) {
    setForm({
      type: "document", kind, documentNumber: "", currency: "USD",
      amountMinor: "", dueAt: "", claimId: "", claimReserveId: "",
    });
  }

  async function openExternalPayment(record) {
    setNotice("");
    try {
      const params = new URLSearchParams({
        shopId: selectedShopId, accountingEntityId: entityId, section: "reserves", first: "100",
      });
      const body = await requestJson(`/api/finance-workspace?${params}`);
      const reserves = body.records || [];
      setForm({
        type: "payment", record, reserves, externalReference: "",
        claimReserveId: "", claimId: "", amountMinor: "",
      });
    } catch (error) {
      setNotice(`Couldn’t load claim reserves: ${error.message}`);
    }
  }

  return <section aria-label="Finance workspace">
    <div className="esd-callout"><strong>Shadow mode</strong><br />Records and approvals are internal only. Enshield never initiates payments or posts to banks or accounting systems.</div>
    <div className="esd-toolbar">
      {assignedEntities.length ? <label>Accounting entity <select value={entityId} onChange={(event) => setEntityId(event.target.value)}>
        {assignedEntities.map((entity) => <option key={entity.id} value={entity.id}>{entity.name || entity.id}</option>)}
      </select></label> : <label>Accounting entity <input value={entityId} onChange={(event) => setEntityId(event.target.value)} placeholder="Required entity ID" /></label>}
    </div>
    <div className="esd-toolbar" role="tablist" aria-label="Finance areas">
      {AREAS.map(([key, label]) => <button key={key} type="button" role="tab" aria-selected={area === key} className={area === key ? "esd-btn" : "esd-link-button"} onClick={() => { setArea(key); setForm(null); }}>{label}</button>)}
    </div>

    {editable && area === "receivables" ? <button type="button" className="esd-btn" onClick={() => openDocument("receivable")}>New receivable</button> : null}
    {editable && area === "payables" ? <button type="button" className="esd-btn" onClick={() => openDocument("payable")}>New payable</button> : null}
    {editable && area === "reserves" ? <button type="button" className="esd-btn" onClick={() => setForm({
      type: "createReserve", claimId: "", reserveKey: "", currency: "USD", openingMinor: "",
    })}>New reserve</button> : null}
    {area === "reserves" ? <p className="esd-muted">Reserve adjustments and releases require a claim-linked reserve and an approved finance operation.</p> : null}
    {area === "reconciliation" ? <>
      <p className="esd-muted">CSV imports are validated before matching. Exceptions must be resolved before a run can be completed.</p>
      {editable ? <form className="esd-finance-form" onSubmit={(event) => {
        event.preventDefault();
        if (reconciliationError || !reconciliationCsv) return;
        mutate({
          action: "import_reconciliation",
          operationKey: `${entityId}:reconciliation:${Date.now()}`,
          csvText: reconciliationCsv,
        });
      }}>
        <h3>Import reconciliation CSV</h3>
        <label>Reconciliation CSV <input type="file" accept=".csv,text/csv" onChange={async (event) => {
          const file = event.target.files?.[0];
          setReconciliationCsv("");
          setReconciliationError("");
          if (!file) return;
          if (file.size > MAX_RECONCILIATION_CSV_BYTES) {
            setReconciliationError("Choose a CSV file that is 2 MB or smaller.");
            return;
          }
          if (!file.name.toLowerCase().endsWith(".csv")) {
            setReconciliationError("Choose a file with a .csv extension.");
            return;
          }
          try {
            setReconciliationCsv(await readFileText(file));
          } catch (error) {
            setReconciliationError(error.message);
          }
        }} /></label>
        {reconciliationError ? <div role="alert" className="esd-error">{reconciliationError}</div> : null}
        <button type="submit" className="esd-btn" disabled={!reconciliationCsv || Boolean(reconciliationError)}>Import reconciliation</button>
      </form> : null}
      {state.runs.length ? <div className="esd-table-wrap"><table className="esd-table">
        <caption>Reconciliation runs</caption>
        <thead><tr><th>Run</th><th>Status</th><th>Unresolved</th>{editable ? <th>Actions</th> : null}</tr></thead>
        <tbody>{state.runs.map((run) => <tr key={run.id}>
          <td data-label="Run">{run.id}</td><td data-label="Status">{run.status}</td>
          <td data-label="Unresolved">{run.unresolvedCount ?? 0}</td>
          {editable ? <td data-label="Actions">{run.status === "processing" && Number(run.unresolvedCount) === 0
            ? <button type="button" className="esd-link-button" aria-label={`Complete reconciliation run ${run.id}`} onClick={() => mutate({ action: "complete_reconciliation", reconciliationRunId: run.id })}>Complete</button>
            : null}</td> : null}
        </tr>)}</tbody>
      </table></div> : null}
    </> : null}

    {form?.type === "document" ? <form className="esd-finance-form" onSubmit={(event) => {
      event.preventDefault();
      mutate({ action: "create_document", document: {
        kind: form.kind, documentNumber: form.documentNumber.trim(), currency: form.currency.toUpperCase(),
        amountMinor: Number(form.amountMinor), dueAt: form.dueAt || undefined,
        operationKey: `${entityId}:${form.kind}:${form.documentNumber.trim()}`,
        ...(form.kind === "payable" ? {
          claimId: form.claimId.trim(), claimReserveId: form.claimReserveId.trim(),
        } : {}),
      } });
    }}>
      <h3>New {form.kind}</h3>
      <label>Document number <input required value={form.documentNumber} onChange={(event) => setForm({ ...form, documentNumber: event.target.value })} /></label>
      {form.kind === "payable" ? <>
        <label>Claim ID <input required value={form.claimId} onChange={(event) => setForm({ ...form, claimId: event.target.value })} /></label>
        <label>Claim reserve ID <input required value={form.claimReserveId} onChange={(event) => setForm({ ...form, claimReserveId: event.target.value })} /></label>
      </> : null}
      <label>Currency <input required maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} /></label>
      <label>Amount (minor units) <input required min="1" step="1" type="number" value={form.amountMinor} onChange={(event) => setForm({ ...form, amountMinor: event.target.value })} /></label>
      <label>Due date <input type="date" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></label>
      <div><button className="esd-btn" type="submit">Save draft</button> <button className="esd-link-button" type="button" onClick={() => setForm(null)}>Cancel</button></div>
    </form> : null}
    {form?.type === "createReserve" ? <form className="esd-finance-form" onSubmit={(event) => {
      event.preventDefault();
      mutate({
        action: "create_reserve",
        claimId: form.claimId.trim(),
        reserveKey: form.reserveKey.trim(),
        currency: form.currency.trim().toUpperCase(),
        openingMinor: Number(form.openingMinor),
      });
    }}>
      <h3>New claim reserve</h3>
      <label>Claim ID <input required value={form.claimId} onChange={(event) => setForm({ ...form, claimId: event.target.value })} /></label>
      <label>Reserve key <input required value={form.reserveKey} onChange={(event) => setForm({ ...form, reserveKey: event.target.value })} /></label>
      <label>Currency <input required maxLength={3} value={form.currency} onChange={(event) => setForm({ ...form, currency: event.target.value })} /></label>
      <label>Opening amount (minor units) <input required min="0" step="1" type="number" value={form.openingMinor} onChange={(event) => setForm({ ...form, openingMinor: event.target.value })} /></label>
      <div><button className="esd-btn" type="submit">Create reserve</button> <button className="esd-link-button" type="button" onClick={() => setForm(null)}>Cancel</button></div>
    </form> : null}
    {form?.type === "payment" ? <form className="esd-finance-form" onSubmit={(event) => {
      event.preventDefault();
      mutate({ action: "record_external_payment", payableDocumentId: form.record.id,
        claimId: form.claimId.trim(), claimReserveId: form.claimReserveId.trim(), confirmation: {
        externalReference: form.externalReference.trim(),
        operationKey: `${entityId}:payment:${form.externalReference.trim()}`,
        currency: form.record.currency,
        amountMinor: Number(form.amountMinor),
      } });
    }}>
      <h3>Record external payment confirmation</h3>
      <p className="esd-muted">This records evidence of a payment made elsewhere. It does not initiate a payment.</p>
      <label>External reference <input required value={form.externalReference} onChange={(event) => setForm({ ...form, externalReference: event.target.value })} /></label>
      <label>Claim reserve <select required value={form.claimReserveId} onChange={(event) => {
        const reserve = form.reserves.find((candidate) => String(candidate.id) === event.target.value);
        setForm({ ...form, claimReserveId: event.target.value, claimId: String(reserve?.claimId || "") });
      }}>
        <option value="">Select a claim reserve</option>
        {form.reserves.map((reserve) => <option key={reserve.id} value={reserve.id}>{reserve.reserveKey || reserve.id}</option>)}
      </select></label>
      <label>Claim ID <input required readOnly value={form.claimId} /></label>
      <label>Confirmed amount (minor units) <input required min="1" step="1" max={form.record.openAmountMinor} type="number" value={form.amountMinor} onChange={(event) => setForm({ ...form, amountMinor: event.target.value })} /></label>
      <div><button className="esd-btn" type="submit">Record confirmation</button> <button className="esd-link-button" type="button" onClick={() => setForm(null)}>Cancel</button></div>
    </form> : null}
    {form?.type === "allocation" ? <form className="esd-finance-form" onSubmit={(event) => {
      event.preventDefault();
      mutate({ action: "allocate_document", kind: form.kind, documentId: form.record.id, allocation: {
        operationKey: `${entityId}:allocation:${form.record.id}:${Date.now()}`,
        currency: form.record.currency, amountMinor: Number(form.amountMinor),
      } });
    }}>
      <h3>Allocate {form.record.documentNumber || form.record.id}</h3>
      <label>Allocation amount (minor units) <input required min="1" step="1" max={form.record.openAmountMinor} type="number" value={form.amountMinor} onChange={(event) => setForm({ ...form, amountMinor: event.target.value })} /></label>
      <div><button className="esd-btn" type="submit">Save allocation</button> <button className="esd-link-button" type="button" onClick={() => setForm(null)}>Cancel</button></div>
    </form> : null}
    {form?.type === "reserve" ? <form className="esd-finance-form" onSubmit={(event) => {
      event.preventDefault();
      mutate({
        action: form.action === "adjust" ? "adjust_reserve" : "release_reserve",
        claimReserveId: form.record.id,
        amountMinor: Number(form.amountMinor),
        operationKey: `${entityId}:reserve:${form.action}:${form.record.id}:${Date.now()}`,
      });
    }}>
      <h3>{form.action === "adjust" ? "Adjust" : "Release"} reserve</h3>
      <label>{form.action === "adjust" ? "Adjustment" : "Release"} amount (minor units) <input required min="1" step="1" type="number" value={form.amountMinor} onChange={(event) => setForm({ ...form, amountMinor: event.target.value })} /></label>
      <div><button className="esd-btn" type="submit">Save reserve {form.action === "adjust" ? "adjustment" : "release"}</button> <button className="esd-link-button" type="button" onClick={() => setForm(null)}>Cancel</button></div>
    </form> : null}
    {form?.type === "reconciliationResolution" ? <form className="esd-finance-form" onSubmit={(event) => {
      event.preventDefault();
      mutate({
        action: "resolve_reconciliation_item",
        reconciliationItemId: form.record.id,
        matchedClaimPaymentId: form.matchedClaimPaymentId.trim(),
        evidenceCode: form.evidenceCode.trim(),
        resolutionReason: form.resolutionReason.trim(),
        operationKey: `${entityId}:reconciliation:resolve:${form.record.id}:${Date.now()}`,
      });
    }}>
      <h3>Resolve reconciliation exception</h3>
      <label>Matched claim payment ID <input required value={form.matchedClaimPaymentId} onChange={(event) => setForm({ ...form, matchedClaimPaymentId: event.target.value })} /></label>
      <label>Evidence code <input required value={form.evidenceCode} onChange={(event) => setForm({ ...form, evidenceCode: event.target.value })} /></label>
      <label>Resolution reason <textarea required value={form.resolutionReason} onChange={(event) => setForm({ ...form, resolutionReason: event.target.value })} /></label>
      <div><button className="esd-btn" type="submit">Save resolution</button> <button className="esd-link-button" type="button" onClick={() => setForm(null)}>Cancel</button></div>
    </form> : null}

    {area === "reports" ? <div className="esd-toolbar">
      <label>Report type <select value={reportType} onChange={(event) => setReportType(event.target.value)}>
        {REPORTS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label>From date <input type="date" value={reportFrom} onChange={(event) => setReportFrom(event.target.value)} /></label>
      <label>To date <input type="date" value={reportTo} onChange={(event) => setReportTo(event.target.value)} /></label>
      <label>As of date <input type="date" value={reportAsOf} onChange={(event) => setReportAsOf(event.target.value)} /></label>
      <Gate permission={PERMISSIONS.EXPORT_REPORTS}><button type="button" className="esd-btn" disabled={!state.records.length} onClick={() => {
        downloadCsv(`enshield-finance-${reportType}.csv`, [
          columns.map(([, label]) => label),
          ...state.records.map((row) => columns.map(([key]) => row[key] ?? "")),
        ]);
      }}>Export CSV</button></Gate>
    </div> : null}
    {notice ? <div role="status" className="esd-callout">{notice}</div> : null}
    {!entityId ? <div className="esd-empty">Choose one assigned client and accounting entity to load finance records.</div> : null}
    {state.status === "loading" ? <div role="status" className="esd-loading">Loading finance records…</div> : null}
    {state.status === "error" ? <div role="alert" className="esd-error">Couldn’t load finance records: {state.error}</div> : null}
    {state.status === "ready" && state.records.length === 0 ? <div className="esd-empty">No {AREAS.find(([key]) => key === area)?.[1].toLowerCase()} records found.</div> : null}
    {state.status === "ready" && state.records.length ? <div className="esd-table-wrap"><table className="esd-table">
      <thead><tr>{columns.map(([key, label]) => <th key={key}>{label}</th>)}{editable && ["receivables", "payables", "reserves", "payments", "reconciliation"].includes(area) ? <th>Actions</th> : null}</tr></thead>
      <tbody>{state.records.map((record, index) => <tr key={record.id || index}>
        {columns.map(([key, label, format]) => <td key={key} data-label={label}>{format === "money" ? money(record[key], record.currency) : (record[key] ?? "—")}</td>)}
        {editable && ["receivables", "payables"].includes(area) ? <td data-label="Actions">
          {record.status === "draft" ? <button type="button" className="esd-link-button" aria-label={`Approve ${record.documentNumber || record.id}`} onClick={() => mutate({ action: "approve_document", kind: area === "receivables" ? "receivable" : "payable", documentId: record.id })}>Approve</button> : null}
          {record.status === "approved" && Number(record.openAmountMinor) > 0 ? <button type="button" className="esd-link-button" aria-label={`Allocate ${record.documentNumber || record.id}`} onClick={() => setForm({ type: "allocation", kind: area === "receivables" ? "receivable" : "payable", record, amountMinor: "" })}>Allocate</button> : null}
          {area === "payables" && record.status === "approved" && Number(record.openAmountMinor) > 0 ? <button type="button" className="esd-link-button" aria-label={`Record external confirmation for ${record.documentNumber || record.id}`} onClick={() => openExternalPayment(record)}>Record external confirmation</button> : null}
        </td> : null}
        {editable && area === "reserves" ? <td data-label="Actions">
          <button type="button" className="esd-link-button" aria-label={`Adjust reserve ${record.id}`} onClick={() => setForm({ type: "reserve", action: "adjust", record, amountMinor: "" })}>Adjust</button>
          <button type="button" className="esd-link-button" aria-label={`Release reserve ${record.id}`} onClick={() => setForm({ type: "reserve", action: "release", record, amountMinor: "" })}>Release</button>
        </td> : null}
        {editable && area === "reconciliation" ? <td data-label="Actions">
          {record.status === "exception" ? <button type="button" className="esd-link-button" aria-label={`Resolve reconciliation item ${record.id}`} onClick={() => setForm({
            type: "reconciliationResolution", record, matchedClaimPaymentId: "", evidenceCode: "", resolutionReason: "",
          })}>Resolve</button> : null}
        </td> : null}
        {editable && area === "payments" ? <td data-label="Actions">
          {record.status === "pending" ? <button type="button" className="esd-link-button" aria-label={`Verify payment ${record.externalReference || record.id}`} onClick={() => mutate({ action: "verify_external_payment", claimPaymentId: record.id })}>Verify</button> : null}
        </td> : null}
      </tr>)}</tbody>
    </table></div> : null}
  </section>;
}
