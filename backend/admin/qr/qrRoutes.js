const express = require("express");
const {
  createQr,
  getQrs,
  deleteQr,
} = require("./qrController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");
const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("Qrs");
const apiRateLimiterDetails = createRateLimiter("Qrs/:id");
router.post("/", roleMiddleware(["admin"]), createQr);
router.get("/", apiRateLimiter, getQrs);
router.delete("/:id", roleMiddleware(["admin"]), deleteQr);
module.exports = router;
