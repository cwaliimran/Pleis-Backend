// routes/supportRoutes.js
const express = require("express");
const {
  createSupportRequest,
  getSupportRequest
} = require("./supportController");
const createRateLimiter = require("../../helperUtils/rateLimiter");

const router = express.Router();
const supportRateLimiter = createRateLimiter("support", 10, 5);
const auth = require("../../middlewares/authMiddleware");
// Route to create a support request
router.post("/", supportRateLimiter, auth,createSupportRequest);
router.get("/", supportRateLimiter, auth,getSupportRequest);



module.exports = router;
