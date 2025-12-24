const express = require('express');
const {
  getOrganizationProfileData,
  getNearbyOrganizationsByLocation,
  getForYouOrganizations,
  getTrendingOrganizationsForHome,
} = require('./organizationProfileController');
const auth = require('../../middlewares/authMiddleware');
const createRateLimiter = require('../../helperUtils/rateLimiter');

const router = express.Router();
router.use(auth);
const apiRateLimiter = createRateLimiter("OrganizationProfile");

// Get all homes with pagination
router.get('/nearby', getNearbyOrganizationsByLocation);
router.post('/for-you', getForYouOrganizations);
router.post('/trending', getTrendingOrganizationsForHome);

router.get('/:organizationId', getOrganizationProfileData);

module.exports = router;
