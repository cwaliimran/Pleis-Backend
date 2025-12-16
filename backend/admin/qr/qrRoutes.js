const express = require("express");
const {
  createQr,
  getQrs,
  getQrDetails,
  updateQr,
  deleteQr,
  getTicketings
} = require("./qrController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");
const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("Qrs");
const apiRateLimiterDetails = createRateLimiter("Qrs/:id");
router.post("/", roleMiddleware(["admin"]), createQr);
// router.post("/", roleMiddleware(["admin", "organizer", "manager"]), getTicketings);
router.get("/", apiRateLimiter, getQrs);
// router.get("/:id", apiRateLimiterDetails, getQrDetails);
// router.put("/:id", roleMiddleware(["admin"]), updateQr);
router.delete("/:id", roleMiddleware(["admin"]), deleteQr);
module.exports = router;
