const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const supportRepository = require("./supportRepository");
const getSupportRequest = async ({ timezone, page, limit, keyword, status, userId,  date, range, sortBy, sortOrder }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  const today = getCurrentDateInTimezone({ timezone, isDateOnly: true });
  let { supportRequests, meta } = await supportRepository.getSupportRequest({ timezone, page, limit, keyword, status, userId,  date, range, today, skip, sortBy, sortOrder });

  return {
    supportRequests,
    meta
  };
};
module.exports = {
getSupportRequest
};