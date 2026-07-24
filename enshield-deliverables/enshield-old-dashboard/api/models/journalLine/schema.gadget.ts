import type { GadgetModel } from "gadget-server";

export const schema: GadgetModel = {
  type: "gadget/model-schema/v2",
  storageKey: "journalLine-model",
  comment: "One positive debit or credit in integer minor units; validated transactionally with its journal.",
  fields: {
    lineKey: { type: "string", validations: { required: true, unique: true }, storageKey: "journalLine-lineKey" },
    accountingEntity: { type: "belongsTo", validations: { required: true }, parent: { model: "accountingEntity" }, storageKey: "journalLine-accountingEntity" },
    journalEntry: { type: "belongsTo", validations: { required: true }, parent: { model: "journalEntry" }, storageKey: "journalLine-journalEntry" },
    ledgerAccount: { type: "belongsTo", validations: { required: true }, parent: { model: "ledgerAccount" }, storageKey: "journalLine-ledgerAccount" },
    sequence: { type: "number", decimals: 0, validations: { required: true }, storageKey: "journalLine-sequence" },
    currency: { type: "string", validations: { required: true }, storageKey: "journalLine-currency" },
    debitMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "journalLine-debitMinor" },
    creditMinor: { type: "number", decimals: 0, validations: { required: true }, storageKey: "journalLine-creditMinor" },
    memo: { type: "string", storageKey: "journalLine-memo" },
    createdBy: { type: "string", validations: { required: true }, storageKey: "journalLine-createdBy" },
  },
};
