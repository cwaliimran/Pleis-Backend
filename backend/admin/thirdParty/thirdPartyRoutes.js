const express = require("express");
const {
  createThirdparty,
  getThirdpartys,
  updateThirdparty,
  deleteThirdparty,
  getThirdpartyDetails,
  getUserThirdpartys,
  updateUserThirdpartyStatus,
  updateUserThirdparty,
} = require("./thirdPartyController");
const createRateLimiter = require("../../helperUtils/rateLimiter");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");

const router = express.Router();

router.use(auth);

// Create a rate limiter for Thirdpartys
const apiRateLimiter = createRateLimiter("Thirdpartys");
const apiRateLimiterDetails = createRateLimiter("Thirdpartys/:id");

// Create a new Thirdparty
router.post("/", auth,roleMiddleware(["admin"]), createThirdparty);

// Get all Thirdpartys with pagination
router.get("/", roleMiddleware(["admin"]),apiRateLimiter, getThirdpartys);


// Update an existing Thirdparty
router.put("/:id", roleMiddleware(["admin"]), updateThirdparty);



// Delete a Thirdparty
router.delete("/:id", roleMiddleware(["admin"]), deleteThirdparty);

module.exports = router;
