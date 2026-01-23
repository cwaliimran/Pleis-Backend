const { validateParams } = require("@utils/responseUtil");

/**
 * Validates ticketing payload at controller level
 * - required fields
 * - basic structure
 */
const validateTicketingPayload = (req, res) => {
  const validateData = {
    rawData: ["ticketings", "paymentDetails"],
  };

  if (!validateParams(req, res, validateData)) return false;

  if (!Array.isArray(req.body.ticketings) || req.body.ticketings.length === 0) {
    return res.status(400).json({
      translationKey: "ticketings_required",
    });
  }

  return true;
};

module.exports = { validateTicketingPayload };
