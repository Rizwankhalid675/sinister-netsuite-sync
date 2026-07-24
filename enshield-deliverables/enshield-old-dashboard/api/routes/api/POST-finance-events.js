import { normalizeFinancialEvent } from "../../lib/finance/ledger.js";
import {
  requireFinanceRouteAccess,
  sendFinanceRouteError,
} from "../../lib/finance/routeAccess.js";

const route = async ({ request, body, reply, api, session, logger }) => {
  const input = body || request?.body || {};
  try {
    const { entity } = await requireFinanceRouteAccess({ api, session }, input);
    const normalized = normalizeFinancialEvent({
      ...input.event,
      accountingEntityId: String(entity.id),
    });
    const event = await api.internal.financialEvent.create({
      ...input.event,
      accountingEntity: { _link: String(entity.id) },
      sourceSystem: normalized.sourceSystem,
      sourceId: normalized.sourceId,
      sourceVersion: normalized.sourceVersion,
      sourceVersionKey: normalized.sourceVersionKey,
      currency: normalized.currency,
      amountMinor: normalized.amountMinor,
    });
    await reply.send({
      success: true,
      event: {
        id: event.financialEventId || event.id,
        status: event.status,
        idempotent: event.idempotent === true,
        sourceVersionKey: event.sourceVersionKey,
        currency: event.currency,
        amountMinor: event.amountMinor,
      },
    });
  } catch (error) {
    await sendFinanceRouteError({ reply, logger }, error, "financialEvent.create");
  }
};

export default route;
