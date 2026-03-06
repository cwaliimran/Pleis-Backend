const express = require("express");
const {
  sendResponse,
  validateParams,


} = require("../../helperUtils/responseUtil");
const GlobalReferralSettings = require("@GlobalReferralSettingsModel");


const auth = require("../../middlewares/authMiddleware");


const router = express.Router();
// ✅ Base web URL for universal links
const BASE_WEB_URL = process.env.API_BASE_URL;

/**
 * Helper to get model dynamically by type
 */
function getModelByType(type) {
    switch (type) {
        case "global":
            return  GlobalReferralSettings;
        case "company":
            return GlobalReferralSettings;
        case "organizer":
            return GlobalReferralSettings;
                    case "user":
            return GlobalReferralSettings;
        default:
            return null;
    }
}

/**
 * Helper to generate one universal share URL
 * Example: https://pleisapp.com/open?type=event&id=XYZabc123
 */
function generateShareLink(result) {
    return `${BASE_WEB_URL}app/global-referral/share?id=${result}`;
}
/**
 * ✅ Generate shareable link
 * Example: GET /api/share/event/68ff18ed8cd2d2f52b25be1a
 * Uses Mongo _id (uuid) → returns link with publicId
 */
router.get("/share/:id", async (req, res) => {
    try {
 
        const { id } = req.params;

        // Validate the parameters
        if (
            !validateParams(req, res, {
                pathParams: ["id"],  // Ensure ID is present
                objectIdFields: ["id"],  // Validate that ID is a valid ObjectId
            })
        ) return;
const result = await saveReferralData(id);
    if (!result) {
      return sendResponse({
        res,
        statusCode: 400, 
        translationKey: "username_required_please_add_username", 
      });
    }
        // Generate the shareable link using the creator's publicCreatorId and document's publicId
        const shareUrl = generateShareLink(result);

        return sendResponse({
            res,
            statusCode: 200,
            translationKey: "share_link_generated_successfully",
            data: {
                shareUrl,
            },
        });
    } catch (err) {
        return sendResponse({
            res,
            statusCode: 500,
            translationKey: "internal_server_error",
            error: err,
        });
    }
});


router.get("/", async (req, res) => {

    try {
        const { id } = req.query; 
        const username=id;

const result = await saveUserReferralData(username, req.ip);
        const appLink = `com.pleis://${result}`;
        const iosFallback = "https://apps.apple.com/app/pleisapp/id1234567890"; // iOS fallback URL
        const androidFallback = "https://play.google.com/store/apps/details?id=com.pleis"; // Android fallback URL

        // Smart redirect HTML with the link to the app or store
        return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Opening ...</title>
          <script>
            function openApp() {
              const appLink = '${appLink}';
              const iosFallback = '${iosFallback}';
              const androidFallback = '${androidFallback}';
              const userAgent = navigator.userAgent || navigator.vendor || window.opera;
              window.location = appLink;
              setTimeout(() => {
                if (/android/i.test(userAgent)) {
                  window.location = androidFallback;  // Redirect to Android if on Android
                } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
                  window.location = iosFallback;  // Redirect to iOS if on iOS
                } else {
                  window.location = 'https://pleisapp.com';  // Default fallback if the device is neither
                }
              }, 1500);  // Timeout for app redirection after 1.5 seconds
            }
            window.onload = openApp;  // Trigger app redirection on page load
          </script>
        </head>
        <body>
          <p style="text-align:center;margin-top:40vh;font-family:sans-serif;">
            Opening <b></b>...
          </p>
        </body>
      </html>
    `);  // Serve the HTML page with the smart redirect logic
    } catch (err) {
       
        return sendResponse({
            res,
            statusCode: 500,
            translationKey: "internal_server_error",  // Handle any internal server errors
            error: err,
        });
    }
});



module.exports = router;
