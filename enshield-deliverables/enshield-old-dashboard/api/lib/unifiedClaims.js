const titleCaseStatus = (value) => String(value || "New")
  .replace(/[_-]+/g, " ")
  .replace(/\b\w/g, (character) => character.toUpperCase());

export function projectLegacyClaim(claim) {
  const currency = String(claim?.currency || "USD").toUpperCase();
  return {
    id: `legacy:${claim.id}`,
    legacyRecordId: claim.id,
    sourceKey: claim.sourceKey,
    source: "legacy",
    platform: claim.platform || "Unknown",
    readOnly: true,
    status: titleCaseStatus(claim.status),
    reason: "Legacy claim",
    claimValueMinor: Number(claim.claimValueMinor || 0),
    claimCurrency: currency,
    orderValueMinor: Number(claim.legacyOrder?.valueMinor || 0),
    orderCurrency: String(claim.legacyOrder?.currency || currency).toUpperCase(),
    createdAt: claim.submittedAt || null,
    order: claim.legacyOrder
      ? { id: `legacy:${claim.legacyOrder.id}`, name: claim.legacyOrder.orderNumber || claim.legacyOrder.legacyId }
      : null,
    client: claim.client
      ? { id: claim.client.id, storeName: claim.client.storeName }
      : null,
  };
}

export function legacyClaimSelect() {
  return {
    id: true,
    sourceKey: true,
    legacyId: true,
    platform: true,
    claimValueMinor: true,
    currency: true,
    status: true,
    submittedAt: true,
    client: { id: true, storeName: true },
    legacyOrder: { id: true, legacyId: true, orderNumber: true, valueMinor: true, currency: true },
  };
}
