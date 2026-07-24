import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "journalEntry-model",
  comment: "Balanced, tenant-scoped shadow journal. Posted entries are immutable and corrected only by linked reversal.",
  fields: {
    sourceVersionKey: { type: "string", validations: { required: true, unique: true }, storageKey: "journalEntry-sourceVersionKey" },
    sourceSystem: { type: "string", validations: { required: true }, storageKey: "journalEntry-sourceSystem" },
    sourceId: { type: "string", validations: { required: true }, storageKey: "journalEntry-sourceId" },
    sourceVersion: { type: "string", validations: { required: true }, storageKey: "journalEntry-sourceVersion" },
    reversalKey: { type: "string", validations: { unique: true }, storageKey: "journalEntry-reversalKey" },
    accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "journalEntry-accountingEntity" },
    accountingPeriod: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingPeriod" }, storageKey: "journalEntry-accountingPeriod" },
    financialEvent: { type: "belongsTo", parent: { model: "financialEvent" }, storageKey: "journalEntry-financialEvent" },
    currency: { type: "string", validations: { required: true }, storageKey: "journalEntry-currency" },
    status: { type: "enum", options: ["draft", "pending_approval", "approved", "posted", "reversed"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "journalEntry-status" },
    shadowMode: { type: "boolean", default: true, validations: { required: true }, storageKey: "journalEntry-shadowMode" },
    memo: { type: "string", storageKey: "journalEntry-memo" },
    preparedBy: { type: "string", validations: { required: true }, storageKey: "journalEntry-preparedBy" },
    preparedAt: { type: "dateTime", includeTime: true, validations: { required: true }, storageKey: "journalEntry-preparedAt" },
    approvedBy: { type: "string", storageKey: "journalEntry-approvedBy" },
    approvedAt: { type: "dateTime", includeTime: true, storageKey: "journalEntry-approvedAt" },
    postedBy: { type: "string", storageKey: "journalEntry-postedBy" },
    postedAt: { type: "dateTime", includeTime: true, storageKey: "journalEntry-postedAt" },
    reversesJournalEntry: { type: "belongsTo", parent: { model: "journalEntry" }, storageKey: "journalEntry-reversesJournalEntry" },
    lines: { type: "hasMany", children: { model: "journalLine", belongsToField: "journalEntry" }, storageKey: "journalEntry-lines" },
  },
};
