/**
 * ONE-OFF DEV SEED — NOT FOR PRODUCTION USE.
 *
 * Creates a single active internalOperator record so the local/dev
 * environment has an identity to sign in as via the dev-only bypass in
 * api/routes/auth/GET-internal-start.js. Runs as a background action so it
 * legitimately satisfies requireOwnerProvisioning() rather than weakening it.
 *
 * Delete this file after running it once.
 */
import { withDevSeedEscape } from "../lib/operatorProvisioning.js";

export const run = async ({ api, logger }) => {
  if (process.env.NODE_ENV === "production") {
    throw new Error("seedDevOperator must never run in production");
  }

  const existing = await api.internalOperator.maybeFindFirst({
    filter: { status: { equals: "active" } },
    select: { id: true, personId: true },
  });
  if (existing) {
    logger.info({ id: existing.id }, "Active internalOperator already exists; skipping");
    return { success: true, skipped: true, id: existing.id, personId: existing.personId };
  }

  const record = await withDevSeedEscape(() =>
    api.internalOperator.create({
      personId: "dev-tester-1",
      name: "Dev Tester",
      email: "dev@enshield.local",
      status: "active",
    })
  );

  logger.info({ id: record.id }, "Seeded dev internalOperator");
  return { success: true, skipped: false, id: record.id, personId: record.personId };
};

export const options = {
  // Callable directly via the API/playground. internalOperator.create's
  // requireOwnerProvisioning() guard has a narrow dev-only exception for
  // trigger.actionApiIdentifier === "seedDevOperator" (see
  // api/lib/operatorProvisioning.js) so this one-off seed can run without
  // an existing operator to bootstrap from. Delete this file after use.
  triggers: { api: true },
};
