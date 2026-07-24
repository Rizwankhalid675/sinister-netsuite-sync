function requiredId(value, name) {
  const id = String(value ?? "").trim();
  if (!id) throw new Error(`${name} is required`);
  return id;
}

function normalizeIsoCurrency(value) {
  const currency = String(value ?? "").trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(currency)) throw new Error("valid ISO currency is required");
  return currency;
}

export async function loadAndValidatePayableClaimContext({
  api, shopId, entityId, claimId, claimReserveId, currency,
}) {
  const expected = {
    shopId: requiredId(shopId, "shop"),
    entityId: requiredId(entityId, "accountingEntity"),
    claimId: requiredId(claimId, "claim"),
    claimReserveId: requiredId(claimReserveId, "claimReserve"),
    currency: normalizeIsoCurrency(currency),
  };
  const claim = await api.claim.findFirst({
    filter: { AND: [
      { id: { equals: expected.claimId } },
      { shopId: { equals: expected.shopId } },
    ] },
    select: { id: true },
  });
  const reserve = await api.claimReserve.findFirst({
    filter: { AND: [
      { id: { equals: expected.claimReserveId } },
      { accountingEntityId: { equals: expected.entityId } },
    ] },
    select: { id: true, accountingEntityId: true, claimId: true, currency: true },
  });
  if (!claim) throw new Error("claim is outside the shop scope");
  if (!reserve) throw new Error("claimReserve is outside the accounting scope");
  if (String(reserve.claimId ?? "") !== expected.claimId) {
    throw new Error("payable, reserve, and claim links must match");
  }
  if (String(reserve.accountingEntityId) !== expected.entityId) {
    throw new Error("payable and reserve entity links must match");
  }
  if (normalizeIsoCurrency(reserve.currency) !== expected.currency) {
    throw new Error("payable and reserve currency must match");
  }
  return { claim, reserve, currency: expected.currency };
}

export async function loadAndValidatePaymentAuthority({
  api, entityId, claimId, payableDocumentId, claimReserveId, currency, amountMinor,
}) {
  const expected = {
    entityId: requiredId(entityId, "accountingEntity"),
    claimId: requiredId(claimId, "claim"),
    payableDocumentId: requiredId(payableDocumentId, "payableDocument"),
    claimReserveId: requiredId(claimReserveId, "claimReserve"),
    currency: normalizeIsoCurrency(currency),
  };
  if (!Number.isSafeInteger(amountMinor) || amountMinor <= 0) {
    throw new Error("payment amount must be a positive safe integer");
  }

  const payable = await api.payableDocument.findFirst({
    filter: { AND: [
      { id: { equals: expected.payableDocumentId } },
      { accountingEntityId: { equals: expected.entityId } },
    ] },
    select: {
      id: true, accountingEntityId: true, claimId: true, claimReserveId: true,
      currency: true, openAmountMinor: true, status: true,
    },
  });
  const reserve = await api.claimReserve.findFirst({
    filter: { AND: [
      { id: { equals: expected.claimReserveId } },
      { accountingEntityId: { equals: expected.entityId } },
    ] },
    select: {
      id: true, accountingEntityId: true, claimId: true, currency: true,
      closingMinor: true,
    },
  });
  if (!payable) throw new Error("payableDocument is outside the accounting scope");
  if (!reserve) throw new Error("claimReserve is outside the accounting scope");
  if (String(payable.claimId ?? "") !== expected.claimId ||
      String(reserve.claimId ?? "") !== expected.claimId) {
    throw new Error("payment, payable, and reserve claim links must match");
  }
  if (String(payable.claimReserveId ?? "") !== expected.claimReserveId) {
    throw new Error("payment, payable, and reserve links must match");
  }
  if (String(payable.accountingEntityId) !== expected.entityId ||
      String(reserve.accountingEntityId) !== expected.entityId) {
    throw new Error("payment, payable, and reserve entity links must match");
  }
  if (normalizeIsoCurrency(payable.currency) !== expected.currency ||
      normalizeIsoCurrency(reserve.currency) !== expected.currency) {
    throw new Error("payment, payable, and reserve currency must match");
  }
  if (!["approved", "partially_settled"].includes(payable.status)) {
    throw new Error("payment requires an approved payable");
  }
  if (!Number.isSafeInteger(payable.openAmountMinor) || amountMinor > payable.openAmountMinor) {
    throw new Error("payment exceeds open payable amount");
  }
  if (!Number.isSafeInteger(reserve.closingMinor) || amountMinor > reserve.closingMinor) {
    throw new Error("payment exceeds open claim reserve amount");
  }
  return { payable, reserve, amountMinor, currency: expected.currency };
}
