const express = require("express");
const auth = require("../../middlewares/authMiddleware");
const roleMiddleware = require("../../middlewares/roleMiddleware");
const router = express.Router();


router.use("/brand", require("./brand/brandRoutes"));
router.use("/serving", require("./serving/servingRoutes"));
router.use("/diet-tag", require("./dietTags/dietTagsRoutes"));
router.use("/allergen", require("./allergen/allergenRoutes"));
router.use("/daypart", require("./daypart/daypartRoutes"));


module.exports = router;