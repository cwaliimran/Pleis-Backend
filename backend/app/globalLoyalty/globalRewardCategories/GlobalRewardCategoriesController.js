const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const categoriesService = require("./GlobalRewardCategoriesService");


const getCategories = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);


  try {
  
    const { categories, meta } = await categoriesService.getCategories({
      page,
      limit,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "categories_fetched_successfully",
      data: categories,
      meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error: error,
    });
  }
};



module.exports = {
  getCategories,
};
