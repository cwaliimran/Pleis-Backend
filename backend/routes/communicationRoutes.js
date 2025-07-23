// communicationRoutes.js
const express = require('express');
const auth = require('../middlewares/authMiddleware');
const {
  sendEmailSgrid,
  sendEmailAws,
  sendSmsViaPinpointAws,
  sendNotificationControllerForTesting,
  sendSmsViaVonage,
  sendSMSSomalianAPI,
  sendEmailBrevo
} = require('../controllers/communicationController');

const router = express.Router();

// Route to send email
router.post('/send-email-sgrid', auth, sendEmailSgrid);
router.post('/send-email-aws', auth, sendEmailAws);
router.post('/send-otp-pin-point', auth, sendSmsViaPinpointAws);
router.post('/send-otp-vonage', auth, sendSmsViaVonage);
router.post('/send-otp-somalian', auth, sendSMSSomalianAPI);
router.post('/send-email-brevo', auth, sendEmailBrevo);

// Route to send notification
router.post('/send-notification', auth, sendNotificationControllerForTesting);

module.exports = router;
