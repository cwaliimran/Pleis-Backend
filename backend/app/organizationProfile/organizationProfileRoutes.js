const express = require('express');
const {
  getOrganizationProfileData,
} = require('./organizationProfileController');
const auth = require('../../middlewares/authMiddleware');

const router = express.Router();
router.use(auth);

// Get all homes with pagination
router.get('/:organizationId', getOrganizationProfileData);

module.exports = router;
