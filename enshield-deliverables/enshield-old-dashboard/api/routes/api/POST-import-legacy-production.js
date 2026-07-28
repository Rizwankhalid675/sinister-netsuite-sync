import { assertLegacyImporter, upsertLegacyBatch, validateLegacyImportRequest } from "../../lib/legacyImport.js";
import { resolveInternalOperator } from "../../lib/internalAccess.js";

const route = async ({ request, reply, api, logger, session }) => {
  try {
    const identity = await resolveInternalOperator({ api, session });
    assertLegacyImporter(identity);
    const { resource, records } = validateLegacyImportRequest(request.body);
    const result = await upsertLegacyBatch(api, resource, records);
    await reply.send({ success: true, resource, ...result });
  } catch (error) {
    logger.error(
      { errorName: error?.name, statusCode: error?.statusCode },
      "Legacy production import batch failed"
    );
    const statusCode = [400, 401, 403, 409, 503].includes(error?.statusCode)
      ? error.statusCode
      : 500;
    await reply.code(statusCode).send({
      success: false,
      error: statusCode === 500 ? "Legacy import failed" : error.message,
    });
  }
};

export default route;
