const express = require('express');
const {
  getMapsData,
} = require('./mapsController');
const auth = require('../../middlewares/authMiddleware');

const router = express.Router();
router.use(auth);

// Get all homes with pagination
router.post('/', getMapsData);

module.exports = router;
