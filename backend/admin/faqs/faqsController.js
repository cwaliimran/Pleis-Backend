const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../helperUtils/responseUtil");

const FaqsService = require("./faqsService");





const createFaqs = async (req, res) => {
  let {
    question,
    answer,
    type,

  } = req.body;

  const userId = req.user._id;
  const timezone = req.user.timezone;

  if (
    !validateParams(req, res, {
      rawData: [
        "question",
        "answer",
        "type",
      ],
    })
  ) return;

  let data = {
    question,
    answer,
    type,
  };
  try {
    const Faqs = await FaqsService.createFaqs(data);
    if (!Faqs) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Faqs_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Faqs_created_successfully",
      data: Faqs,
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
const getFaqss = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "active", date, range } = req.query;
  try {


    const userId = req.user._id;
    const timezone = req.user.timezone;
    const { Faqss, meta } = await FaqsService.getFaqss({
      timezone,
      page,
      limit,
      keyword,
      status,
      userId,
      date,
      range
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Faqss_fetched_successfully",
      data: Faqss,
      meta,
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
const updateFaqs = async (req, res) => {
  const { id } = req.params;
  let {
    question,
    answer,
    type,
  } = req.body;

  const userId = req.user._id;
  const timezone = req.user.timezone;



  let data = {
    question,
    answer,
    type,
  };
  try {
    const updated = await FaqsService.updateFaqs(id, data);
    if (updated && updated.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: updated.error,
      });
    }

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Reservation_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Reservation_updated_successfully",
      data: updated,
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

const deleteFaqs = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await FaqsService.deleteFaqs(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "Faqs_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Faqs_deleted_successfully",
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
  createFaqs,
  getFaqss,
  updateFaqs,
  deleteFaqs,

};