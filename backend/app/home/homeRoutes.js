const express = require('express');
const {
  getHome,
  globalSearch,
  globalFilters
} = require('./homeController');
const auth = require('../../middlewares/authMiddleware');

const router = express.Router();
router.use(auth);

// Get all homes with pagination
router.post('/', getHome);
router.post('/global/search', globalSearch);
router.post('/global/filters', globalFilters);




module.exports = router;
