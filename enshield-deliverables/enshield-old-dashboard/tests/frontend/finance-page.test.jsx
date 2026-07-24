import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FinancePage } from "../../web/routes/finance";

const role = {
  selectedShopId: "shop-1",
  clients: [{ shopId: "shop-1", name: "Rudy's", accountingEntityId: "entity-1" }],
  can: () => true,
};

vi.mock("../../web/lib/useRole", () => ({
  useRole: () => role,
  Gate: ({ children }) => children,
}));

function json(body, ok = true) {
  return Promise.resolve({ ok, json: async () => body });
}

describe("finance workspace", () => {
  beforeEach(() => {
    role.can = () => true;
    global.fetch = vi.fn(() => json({ success: true, records: [] }));
  });

  it("uses an assigned accounting entity and contains no mojibake", async () => {
    const { container } = render(<FinancePage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.getByRole("combobox", { name: "Accounting entity" })).toHaveValue("entity-1");
    expect(container.textContent).not.toMatch(/Ã|â‚¬|â„¢/);
  });

  it("creates a draft receivable without initiating money movement", async () => {
    const user = userEvent.setup();
    render(<FinancePage />);
    await user.click(screen.getByRole("tab", { name: "Receivables" }));
    await user.click(screen.getByRole("button", { name: "New receivable" }));
    await user.type(screen.getByLabelText("Document number"), "INV-100");
    await user.type(screen.getByLabelText("Amount (minor units)"), "12500");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalledWith(
      "/api/finance-operations",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining('"action":"create_document"'),
      })
    ));
    const post = global.fetch.mock.calls.find(([, options]) => options?.method === "POST");
    const request = JSON.parse(post[1].body);
    expect(request.document).toMatchObject({
      kind: "receivable",
      documentNumber: "INV-100",
      amountMinor: 12500,
      currency: "USD",
    });
    expect(JSON.stringify(request)).not.toMatch(/initiate|bankFeed|accountingSync/i);
  });

  it("creates a claim-linked payable compatible with payment recording", async () => {
    const user = userEvent.setup();
    render(<FinancePage />);
    await user.click(screen.getByRole("tab", { name: "Payables" }));
    await user.click(screen.getByRole("button", { name: "New payable" }));
    await user.type(screen.getByLabelText("Document number"), "BILL-100");
    await user.type(screen.getByLabelText("Claim ID"), "claim-1");
    await user.type(screen.getByLabelText("Claim reserve ID"), "reserve-1");
    await user.type(screen.getByLabelText("Amount (minor units)"), "12500");
    await user.click(screen.getByRole("button", { name: "Save draft" }));
    await waitFor(() => {
      const post = global.fetch.mock.calls.find(([, options]) => options?.method === "POST");
      expect(JSON.parse(post[1].body)).toMatchObject({
        action: "create_document",
        document: {
          kind: "payable", documentNumber: "BILL-100",
          claimId: "claim-1", claimReserveId: "reserve-1",
          amountMinor: 12500, currency: "USD",
        },
      });
    });
  });

  it("shows contextual document actions and sends approval", async () => {
    global.fetch = vi.fn((url, options) => options?.method === "POST"
      ? json({ success: true, record: { id: "ar-1", status: "approved" } })
      : json({ success: true, records: [{
        id: "ar-1", documentNumber: "INV-1", status: "draft",
        currency: "USD", amountMinor: 1000, openAmountMinor: 1000,
      }] }));
    const user = userEvent.setup();
    render(<FinancePage />);
    await user.click(screen.getByRole("tab", { name: "Receivables" }));
    await user.click(await screen.findByRole("button", { name: "Approve INV-1" }));
    await waitFor(() => {
      const post = global.fetch.mock.calls.find(([, options]) => options?.method === "POST");
      const request = JSON.parse(post[1].body);
      expect(request).toMatchObject({ action: "approve_document", kind: "receivable", documentId: "ar-1" });
    });
  });

  it("renders report-specific columns and formatted currency", async () => {
    global.fetch = vi.fn((url) => url.startsWith("/api/finance-reports")
      ? json({ success: true, rows: [{
        accountCode: "1000", currency: "USD", debitMinor: 12345,
        creditMinor: 0, balanceMinor: 12345,
      }] })
      : json({ success: true, records: [] }));
    const user = userEvent.setup();
    render(<FinancePage />);
    await user.click(screen.getByRole("tab", { name: "Reports" }));
    expect(await screen.findByRole("columnheader", { name: "Account" })).toBeInTheDocument();
    expect(screen.getByRole("columnheader", { name: "Debit" })).toBeInTheDocument();
    expect(screen.getAllByText("$123.45").length).toBeGreaterThan(0);
  });

  it("records an external payment confirmation and explicitly does not initiate it", async () => {
    global.fetch = vi.fn((url, options) => options?.method === "POST"
      ? json({ success: true, record: { id: "pay-1" } })
      : url.includes("section=reserves")
        ? json({ success: true, records: [{ id: "reserve-1", reserveKey: "claim-1:initial", claimId: "claim-1" }] })
        : json({ success: true, records: [{
        id: "ap-1", documentNumber: "BILL-1", status: "approved",
        currency: "USD", amountMinor: 5000, openAmountMinor: 5000,
      }] }));
    const user = userEvent.setup();
    render(<FinancePage />);
    await user.click(screen.getByRole("tab", { name: "Payables" }));
    await user.click(await screen.findByRole("button", { name: "Record external confirmation for BILL-1" }));
    expect(screen.getByText(/does not initiate a payment/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText("External reference"), "BANK-77");
    await user.selectOptions(screen.getByLabelText("Claim reserve"), "reserve-1");
    expect(screen.getByLabelText("Claim ID")).toHaveValue("claim-1");
    await user.type(screen.getByLabelText("Confirmed amount (minor units)"), "5000");
    expect(screen.queryByLabelText(/verified by/i)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Record confirmation" }));
    await waitFor(() => {
      const post = global.fetch.mock.calls.find(([, options]) => options?.method === "POST");
      expect(JSON.parse(post[1].body)).toMatchObject({
        action: "record_external_payment",
        payableDocumentId: "ap-1",
        claimId: "claim-1",
        claimReserveId: "reserve-1",
        confirmation: {
          externalReference: "BANK-77", amountMinor: 5000,
          currency: "USD",
        },
      });
      expect(post[1].body).not.toContain("verifiedById");
    });
  });

  it("exposes a separate verifier action for pending external confirmations", async () => {
    global.fetch = vi.fn((url, options) => options?.method === "POST"
      ? json({ success: true, record: { id: "pay-1", status: "verified" } })
      : json({ success: true, records: [{
        id: "pay-1", externalReference: "BANK-77", status: "pending",
        currency: "USD", amountMinor: 5000, recordedById: "operator-1",
      }] }));
    const user = userEvent.setup();
    render(<FinancePage />);
    await user.click(screen.getByRole("tab", { name: "Payment register" }));
    await user.click(await screen.findByRole("button", { name: "Verify payment BANK-77" }));
    await waitFor(() => {
      const post = global.fetch.mock.calls.find(([, options]) => options?.method === "POST");
      expect(JSON.parse(post[1].body)).toMatchObject({
        action: "verify_external_payment", claimPaymentId: "pay-1",
      });
    });
  });

  it("does not expose edit controls without edit_finance", async () => {
    role.can = (permission) => permission === "view_finance";
    render(<FinancePage />);
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "New receivable" })).not.toBeInTheDocument();
  });

  it("submits a claim reserve adjustment from the selected reserve", async () => {
    global.fetch = vi.fn((url, options) => options?.method === "POST"
      ? json({ success: true, record: { id: "reserve-1" } })
      : json({ success: true, records: [{
        id: "reserve-1", currency: "USD", openingMinor: 1000,
        additionsMinor: 0, releasesMinor: 0, paymentsMinor: 0, closingMinor: 1000,
      }] }));
    const user = userEvent.setup();
    render(<FinancePage />);
    await user.click(screen.getByRole("tab", { name: "Claim reserves" }));
    await user.click(await screen.findByRole("button", { name: "Adjust reserve reserve-1" }));
    await user.type(screen.getByLabelText("Adjustment amount (minor units)"), "250");
    await user.click(screen.getByRole("button", { name: "Save reserve adjustment" }));
    await waitFor(() => {
      const post = global.fetch.mock.calls.find(([, options]) => options?.method === "POST");
      expect(JSON.parse(post[1].body)).toMatchObject({
        action: "adjust_reserve", claimReserveId: "reserve-1", amountMinor: 250,
      });
      expect(JSON.parse(post[1].body).operationKey).toMatch(/^entity-1:reserve:adjust:reserve-1:/);
    });
  });

  it("collects reconciliation match evidence and an idempotency key", async () => {
    global.fetch = vi.fn((url, options) => options?.method === "POST"
      ? json({ success: true, record: { id: "item-1", status: "resolved" } })
      : json({ success: true, records: [{
        id: "item-1", externalReference: "BANK-1", status: "exception",
        currency: "USD", amountMinor: 1000,
      }] }));
    const user = userEvent.setup();
    render(<FinancePage />);
    await user.click(screen.getByRole("tab", { name: "Reconciliation" }));
    await user.click(await screen.findByRole("button", { name: "Resolve reconciliation item item-1" }));
    await user.type(screen.getByLabelText("Matched claim payment ID"), "payment-1");
    await user.type(screen.getByLabelText("Evidence code"), "BANK_STATEMENT");
    await user.type(screen.getByLabelText("Resolution reason"), "Matched against bank evidence");
    await user.click(screen.getByRole("button", { name: "Save resolution" }));
    await waitFor(() => {
      const post = global.fetch.mock.calls.find(([, options]) => options?.method === "POST");
      const payload = JSON.parse(post[1].body);
      expect(payload).toMatchObject({
        action: "resolve_reconciliation_item", reconciliationItemId: "item-1",
        matchedClaimPaymentId: "payment-1", evidenceCode: "BANK_STATEMENT",
        resolutionReason: "Matched against bank evidence",
      });
      expect(payload.operationKey).toMatch(/^entity-1:reconciliation:resolve:item-1:/);
    });
  });

  it("exposes report period and as-of controls in report requests", async () => {
    const user = userEvent.setup();
    render(<FinancePage />);
    await user.click(screen.getByRole("tab", { name: "Reports" }));
    await user.type(screen.getByLabelText("From date"), "2026-01-01");
    await user.type(screen.getByLabelText("To date"), "2026-06-30");
    await user.type(screen.getByLabelText("As of date"), "2026-06-30");
    await waitFor(() => {
      const reportCall = global.fetch.mock.calls.find(([url]) => url.startsWith("/api/finance-reports")
        && url.includes("from=2026-01-01") && url.includes("to=2026-06-30") && url.includes("asOf=2026-06-30"));
      expect(reportCall).toBeDefined();
      expect(reportCall[0]).toContain("to=2026-06-30");
      expect(reportCall[0]).toContain("asOf=2026-06-30");
    });
  });

  it("creates a claim-linked reserve with zero movement balances", async () => {
    const user = userEvent.setup();
    render(<FinancePage />);
    await user.click(screen.getByRole("tab", { name: "Claim reserves" }));
    await user.click(screen.getByRole("button", { name: "New reserve" }));
    await user.type(screen.getByLabelText("Claim ID"), "claim-1");
    await user.type(screen.getByLabelText("Reserve key"), "claim-1:initial");
    await user.type(screen.getByLabelText("Opening amount (minor units)"), "25000");
    await user.click(screen.getByRole("button", { name: "Create reserve" }));
    await waitFor(() => {
      const post = global.fetch.mock.calls.find(([, options]) => options?.method === "POST");
      expect(JSON.parse(post[1].body)).toMatchObject({
        action: "create_reserve", claimId: "claim-1", reserveKey: "claim-1:initial",
        currency: "USD", openingMinor: 25000,
      });
    });
  });

  it("imports a bounded CSV reconciliation file", async () => {
    global.fetch = vi.fn((url, options) => options?.method === "POST"
      ? json({ success: true, record: { id: "run-1" } })
      : json({ success: true, records: [], reconciliationRuns: [] }));
    const user = userEvent.setup();
    render(<FinancePage />);
    await user.click(screen.getByRole("tab", { name: "Reconciliation" }));
    const csv = "externalReference,amountMinor,currency\nBANK-1,100,USD\n";
    await user.upload(screen.getByLabelText("Reconciliation CSV"), new File([csv], "bank.csv", { type: "text/csv" }));
    await user.click(screen.getByRole("button", { name: "Import reconciliation" }));
    await waitFor(() => {
      const post = global.fetch.mock.calls.find(([, options]) => options?.method === "POST");
      const payload = JSON.parse(post[1].body);
      expect(payload.action).toBe("import_reconciliation");
      expect(payload.csvText).toBe(csv);
      expect(payload.operationKey).toMatch(/^entity-1:reconciliation:/);
    });
  });

  it("rejects an oversized reconciliation file in the client", async () => {
    const user = userEvent.setup();
    render(<FinancePage />);
    await user.click(screen.getByRole("tab", { name: "Reconciliation" }));
    await user.upload(screen.getByLabelText("Reconciliation CSV"), new File(["x".repeat(2_000_001)], "large.csv", { type: "text/csv" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(/2 MB or smaller/i);
    expect(screen.getByRole("button", { name: "Import reconciliation" })).toBeDisabled();
  });

  it("completes a processing reconciliation run with zero unresolved items", async () => {
    global.fetch = vi.fn((url, options) => options?.method === "POST"
      ? json({ success: true, record: { id: "run-1", status: "completed" } })
      : json({ success: true, records: [], reconciliationRuns: [{
        id: "run-1", status: "processing", unresolvedCount: 0, preparedById: "operator-1",
      }] }));
    const user = userEvent.setup();
    render(<FinancePage />);
    await user.click(screen.getByRole("tab", { name: "Reconciliation" }));
    await user.click(await screen.findByRole("button", { name: "Complete reconciliation run run-1" }));
    await waitFor(() => {
      const post = global.fetch.mock.calls.find(([, options]) => options?.method === "POST");
      expect(JSON.parse(post[1].body)).toMatchObject({
        action: "complete_reconciliation", reconciliationRunId: "run-1",
      });
    });
  });
});
