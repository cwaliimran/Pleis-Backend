const {
  sendResponse,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
const { flushAllCaches } = require("@cacheNamespaces");

/**
 * DELETE /admin/cache
 * Wipe process L1 + all Redis cache keys (keeps buffer:* and socket.io keys).
 */
const flushCaches = async (req, res) => {
  try {
    const result = await flushAllCaches();

    if (!result.ok) {
      return sendResponse({
        res,
        statusCode: 500,
        translationKey: "cache_flush_failed",
        data: result,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "cache_flushed_successfully",
      data: {
        redisUp: result.redisUp,
        deleted: result.deleted,
      },
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

module.exports = {
  flushCaches,
};
