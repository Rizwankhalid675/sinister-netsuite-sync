/**
 * Ordered persistence unit for a transactional Gadget claim model action.
 * The caller's model-action transaction is the rollback boundary.
 */
export async function persistClaimMutation({
  saveRecord,
  createEvent,
  createAudit,
}) {
  await saveRecord();
  if (createEvent) await createEvent();
  await createAudit();
}
