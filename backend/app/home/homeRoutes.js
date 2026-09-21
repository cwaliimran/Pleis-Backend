const express = require('express');
const {
  getHome,
  globalSearch,
  globalFilters
} = require('./homeController');
const auth = require('../../middlewares/authMiddleware');

const router = express.Router();
router.use(auth);

// Get home feed (geo-cell Redis cache on location-scoped sections).
// Reports: ./HOME_API_SYSTEM_REPORT.html · ./GLOBAL_SEARCH_SYSTEM_REPORT.html · ./GLOBAL_FILTERS_SYSTEM_REPORT.html
router.post('/', getHome);
// Keyword search + filterKey drill-down + filters — same geohash / L1+Redis pattern as home
router.post('/global/search', globalSearch);
router.post('/global/filters', globalFilters);




module.exports = router;
