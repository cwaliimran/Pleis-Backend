const express = require("express");
const {
  getVenueTypes,
  getOrganizations,
  getVenues,
  getCategories,
  getTags,
  getEvents,
  getmenuItemCategories,
  getmenuItem,
  getmenu,
  getTiers,
  getTickting
} = require("./generalAPIController");
const auth = require("../../middlewares/authMiddleware");

const router = express.Router();

router.use(auth);


router.get("/venu-types", getVenueTypes);
router.get("/venue", getVenues);
router.get("/events", getEvents);
router.get("/organizations", getOrganizations);
router.get("/categories", getCategories);
router.get("/tags", getTags);
router.get("/menu-item-categories", getmenuItemCategories);
router.get("/menu", getmenu);
router.get("/menu-item", getmenuItem);
router.get("/tiers", getTiers);
router.get("/ticketing", getTickting);
router.use("/presets", require("../../admin/menuManagement/menuPreset/presetsRoutes"));





module.exports = router;