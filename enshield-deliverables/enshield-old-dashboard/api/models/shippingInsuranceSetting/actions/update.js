/** @type {ActionRun} */
export const run = async () => {
  const error = new Error("Protection pricing rows are append-only");
  error.statusCode = 405;
  throw error;
};

export const options = { actionType: "update" };
