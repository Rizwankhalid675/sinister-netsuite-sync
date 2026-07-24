import { requireFinanceRouteAccess, sendFinanceRouteError } from "../../lib/finance/routeAccess.js";

const route = async ({ request, body, reply, api, session, logger }) => {
  const input = body || request?.body || {};
  try {
    const { access, entity } = await requireFinanceRouteAccess({ api, session }, input);
    let result;
    if (input.action === "create_document") {
      const model = input.document?.kind === "receivable" ? "receivableDocument" : "payableDocument";
      const documentInput = {
          accountingEntity: { _link: String(entity.id) },
          documentKey: input.document?.operationKey,
          documentNumber: input.document?.documentNumber,
          currency: input.document?.currency,
          amountMinor: input.document?.amountMinor,
          dueAt: input.document?.dueAt,
      };
      if (model === "payableDocument") {
        documentInput.claim = { _link: String(input.document?.claimId) };
        documentInput.claimReserve = { _link: String(input.document?.claimReserveId) };
      }
      result = await api.internal[model].create({
        [model]: documentInput,
      });
    } else if (input.action === "create_reserve") {
      result = await api.internal.claimReserve.create({
        claimReserve: {
          accountingEntity: { _link: String(entity.id) },
          claim: { _link: String(input.claimId) },
          reserveKey: input.reserveKey,
          currency: input.currency,
          openingMinor: input.openingMinor,
        },
      });
    } else if (input.action === "approve_document") {
      const model = input.kind === "receivable" ? "receivableDocument" : "payableDocument";
      result = await api.internal[model].approve(String(input.documentId));
    } else if (input.action === "record_external_payment") {
      const confirmation = input.confirmation || {};
      result = await api.internal.claimPayment.create({
        claimPayment: {
          accountingEntity: { _link: String(entity.id) },
          payableDocument: { _link: String(input.payableDocumentId) },
          claimReserve: { _link: String(input.claimReserveId) },
          claim: { _link: String(input.claimId) },
          paymentKey: confirmation.operationKey,
          externalReference: confirmation.externalReference,
          currency: confirmation.currency,
          amountMinor: confirmation.amountMinor,
          initiatedBySystem: false,
        },
      });
    } else if (input.action === "verify_external_payment") {
      result = await api.internal.claimPayment.verify(String(input.claimPaymentId));
    } else if (input.action === "complete_reconciliation") {
      result = await api.internal.reconciliationRun.complete(String(input.reconciliationRunId));
    } else if (input.action === "import_reconciliation") {
      result = await api.internal.reconciliationRun.create({
        reconciliationRun: {
          accountingEntity: { _link: String(entity.id) },
          operationKey: input.operationKey,
        },
        csvText: input.csvText,
      });
    } else if (input.action === "resolve_reconciliation_item") {
      result = await api.internal.reconciliationItem.resolve(String(input.reconciliationItemId), {
        matchedClaimPaymentId: input.matchedClaimPaymentId,
        evidenceCode: input.evidenceCode,
        resolutionReason: input.resolutionReason,
        operationKey: input.operationKey,
      });
    } else if (input.action === "adjust_reserve" || input.action === "release_reserve") {
      const action = input.action === "adjust_reserve" ? "adjust" : "release";
      result = await api.internal.claimReserve[action](String(input.claimReserveId), {
        amountMinor: input.amountMinor,
        operationKey: input.operationKey,
      });
    } else if (input.action === "allocate_document") {
      const model = input.kind === "receivable" ? "receivableDocument" : "payableDocument";
      result = await api.internal[model].allocate(String(input.documentId), {
        allocation: input.allocation,
      });
    } else {
      const error = new Error("Unsupported finance operation");
      error.statusCode = 400;
      throw error;
    }
    await reply.send({ success: true, shadowMode: true, record: result });
  } catch (error) {
    await sendFinanceRouteError({ reply, logger }, error, `financeOperations.${input.action || "unknown"}`);
  }
};

export default route;
