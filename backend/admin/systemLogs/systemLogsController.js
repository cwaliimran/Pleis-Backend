const {
  sendResponse,
  getReadableErrorMessage,
} = require("../../helperUtils/responseUtil");
const {
  listLogFilesService,
  getLogsService,
} = require("./systemLogsService");

const listLogFiles = async (req, res) => {
  try {
    const data = await listLogFilesService();
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "system_log_files_fetched",
      data,
    });
  } catch (error) {
    const err = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: err.message,
      error,
    });
  }
};

const getLogs = async (req, res) => {
  try {
    const { type, date, file, keyword, level, from, surface } = req.query;

    // Don't use parsePaginationParams — it caps at 100, too small for log files
    let limit = parseInt(req.query.limit, 10);
    if (isNaN(limit) || limit < 1) limit = 500;
    if (limit > 5000) limit = 5000;

    const result = await getLogsService({
      type: type || "access",
      date,
      file,
      limit,
      keyword,
      level,
      from: from === "head" ? "head" : "tail",
      surface: surface || undefined,
    });

    if (!result.success) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: result.message,
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "system_logs_fetched",
      data: {
        file: result.file,
        type: result.type,
        entries: result.entries,
      },
      meta: result.meta,
    });
  } catch (error) {
    const err = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: err.message,
      error,
    });
  }
};

module.exports = {
  listLogFiles,
  getLogs,
};
