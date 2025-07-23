const express = require('express');
const {
  getHome,
} = require('../controllers/homeController');
const auth = require('../middlewares/authMiddleware');

const router = express.Router();
router.use(auth);

// Get all homes with pagination
router.post('/', getHome);

module.exports = router;
