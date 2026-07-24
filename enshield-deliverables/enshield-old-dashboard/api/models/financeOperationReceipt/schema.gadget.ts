import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "financeOperationReceipt-model",
  comment: "Private transaction receipt. Its unique derived operationKey serializes shadow-ledger state transitions.",
  fields: {
    operationKey: { type: "string", validations: { required: true, unique: true }, storageKey: "financeOperationReceipt-operationKey" },
    accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "financeOperationReceipt-accountingEntity" },
    journalEntry: { type: "belongsTo", parent: { model: "journalEntry" }, storageKey: "financeOperationReceipt-journalEntry" },
    operation: { type: "enum", options: ["submit", "approve", "post", "reverse","create_document","approve_document","allocate_document","record_payment","verify_payment","create_reserve","adjust_reserve","release_reserve","import_reconciliation","resolve_reconciliation","complete_reconciliation","document_balance","record_revision"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "financeOperationReceipt-operation" },
    actorId: { type: "string", validations: { required: true }, storageKey: "financeOperationReceipt-actorId" },
    status: { type: "enum", options: ["claimed", "completed"], acceptMultipleSelections: false, acceptUnlistedOptions: false, validations: { required: true }, storageKey: "financeOperationReceipt-status" },
    resultJournalEntry: { type: "belongsTo", parent: { model: "journalEntry" }, storageKey: "financeOperationReceipt-resultJournalEntry" },
    resultRecordId: { type: "string", storageKey: "financeOperationReceipt-resultRecordId" },
    completedAt: { type: "dateTime", includeTime: true, storageKey: "financeOperationReceipt-completedAt" },
  },
};
