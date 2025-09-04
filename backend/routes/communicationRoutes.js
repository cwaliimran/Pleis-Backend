// communicationRoutes.js
const express = require('express');
const auth = require('../middlewares/authMiddleware');
const {
  sendSmsViaPinpointAws,
  sendNotificationControllerForTesting,
} = require('../controllers/communicationController');

const router = express.Router();

// Route to send email
router.post('/send-otp-pin-point', auth, sendSmsViaPinpointAws);

// Route to send notification
router.post('/send-notification', auth, sendNotificationControllerForTesting);

module.exports = router;
