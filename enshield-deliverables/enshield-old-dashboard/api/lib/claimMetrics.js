const TERMINAL_CLAIM_STATUSES = new Set([
  "Paid",
  "Closed",
  "Denied",
  "Cancelled",
]);

export function isOpenClaimStatus(status) {
  return Boolean(status) && !TERMINAL_CLAIM_STATUSES.has(status);
}

export function countOpenClaims(claims) {
  return claims.reduce(
    (count, claim) => count + (isOpenClaimStatus(claim.status) ? 1 : 0),
    0
  );
}

export async function loadOpenClaimCount(api, shopId, maxRecords = 100000) {
  const claims = [];
  let records = await api.claim.findMany({
    filter: { shopId: { equals: shopId } },
    first: 250,
    select: { status: true },
  });
  claims.push(...records);
  while (records.hasNextPage) {
    if (claims.length >= maxRecords) {
      const error = new Error("Claim metric safety limit exceeded");
      error.statusCode = 503;
      throw error;
    }
    records = await records.nextPage();
    claims.push(...records);
  }
  return countOpenClaims(claims);
}
