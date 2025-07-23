// middlewares/adminMiddleware.js
const { sendResponse } = require("../helperUtils/responseUtil");

const admin = (req, res, next) => {
  if (req.user.userType === "admin") {
    next();
  } else {
    sendResponse({
      res,
      statusCode: 403,
      translationKey: "Access denied. Admins only.",
      error: "Access denied. Admins only."
    });
  }
};


module.exports = admin;
