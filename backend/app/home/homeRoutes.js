const express = require('express');
const {
  getHome,
} = require('./homeController');
const auth = require('../../middlewares/authMiddleware');

const router = express.Router();
router.use(auth);

// Get all homes with pagination
router.post('/', getHome);

//popular events routes
router.use("/popular-events", require("../popularEvents/popularEventsRoutes"));




module.exports = router;
