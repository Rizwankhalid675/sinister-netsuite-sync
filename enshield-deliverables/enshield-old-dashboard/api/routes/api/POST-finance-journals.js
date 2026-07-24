import {
  requireFinanceRouteAccess,
  sendFinanceRouteError,
} from "../../lib/finance/routeAccess.js";

const ACTIONS = new Set(["create", "update", "submit", "approve", "post", "reverse"]);

const route = async ({ request, body, reply, api, session, logger }) => {
  const input = body || request?.body || {};
  try {
    const { entity } = await requireFinanceRouteAccess({ api, session }, input);
    const action = input.action;
    if (!ACTIONS.has(action)) {
      const error = new Error("Unsupported finance journal action");
      error.statusCode = 400;
      throw error;
    }
    let journal;
    if (action === "create") {
      const requested = input.journal || {};
      journal = await api.internal.journalEntry.create({
        accountingPeriod: requested.accountingPeriod,
        financialEvent: requested.financialEvent,
        currency: requested.currency,
        memo: requested.memo,
        sourceSystem: requested.sourceSystem,
        sourceId: requested.sourceId,
        sourceVersion: requested.sourceVersion,
        accountingEntity: { _link: String(entity.id) },
      });
    } else {
      if (!input.journalEntryId) {
        const error = new Error("journalEntryId is required");
        error.statusCode = 400;
        throw error;
      }
      const existing = await api.journalEntry.findFirst({
        filter: {
          AND: [
            { id: { equals: String(input.journalEntryId) } },
            { accountingEntityId: { equals: String(entity.id) } },
          ],
        },
        select: { id: true },
      });
      if (!existing) {
        const error = new Error("Journal entry not found");
        error.statusCode = 404;
        throw error;
      }
      journal =
        action === "update"
          ? await api.internal.journalEntry.update(existing.id, input.journal || {})
          : await api.internal.journalEntry[action](existing.id, input.actionParams || {});
    }
    await reply.send({
      success: true,
      journal: {
        id: journal?.journalEntryId || journal?.id || input.journalEntryId,
        status: journal?.status,
        shadowMode: journal?.shadowMode ?? true,
        idempotent: journal?.idempotent === true,
      },
    });
  } catch (error) {
    await sendFinanceRouteError(
      { reply, logger },
      error,
      `journalEntry.${input.action || "unknown"}`
    );
  }
};

export default route;
