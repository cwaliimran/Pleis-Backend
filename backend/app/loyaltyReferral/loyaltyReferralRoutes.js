const express = require("express");
const {
  sendResponse,
  validateParams,
} = require("../../helperUtils/responseUtil");
const {
  saveUserReferralData
} = require("./loyaltyReferralController");
const mongoose = require("mongoose");
const auth = require("../../middlewares/authMiddleware");
const { getUserOrganizationPublicIds } = require("./loyaltyReferralController");


const router = express.Router();



// router.post("/", createUserReferradrecord);
// router.get("/history", auth,getUserReferradrecord);


  






// ✅ Base web URL for universal links
const BASE_WEB_URL = process.env.API_BASE_URL;

/**
 * Helper to get model dynamically by type
 */


/**
 * Helper to generate one universal share URL
 * Example: https://pleisapp.com/open?type=event&id=XYZabc123
 */
function generateShareLink(organizationPublicId, userPublicId) {
    return `${BASE_WEB_URL}app/loyalty-referral/share?organizer=${organizationPublicId}&user=${userPublicId}`;
}
/**
 * ✅ Generate shareable link
 * Example: GET /api/share/event/68ff18ed8cd2d2f52b25be1a
 * Uses Mongo _id (uuid) → returns link with publicId
 */
router.get("/share/:organizer",auth, async (req, res) => {
    try {
 
        const { organizer } = req.params;

        // Validate the parameters
        if (
            !validateParams(req, res, {
                pathParams: ["organizer"],  // Ensure ID is present
                objectIdFields: ["organizer"],  // Validate that ID is a valid ObjectId
            })
        ) return;

        userId=req.user._id;
const result = await getUserOrganizationPublicIds(
  new mongoose.Types.ObjectId(userId),
  new mongoose.Types.ObjectId(organizer)
);
        const shareUrl = generateShareLink(result.organizationPublicIds, result.userPublicId);

        return sendResponse({
            res,
            statusCode: 200,
            translationKey: "share_link_generated_successfully",
            data: {
                shareUrl,
            },
        });
    } catch (err) {
        console.error("Error generating share link:", err);
        return sendResponse({
            res,
            statusCode: 500,
            translationKey: "internal_server_error",
            error: err,
        });
    }
});


router.get("/share", async (req, res) => {

    try {
        const { organizer, user } = req.query;
        const referrer=user
const result = await saveUserReferralData(organizer,referrer);

        const appLink = `com.pleis://organizer=${result.organizerId}/referrer=${result.referrerId}`; // Deep link to open the app
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
        console.error("Error resolving shared link:", err);
        return sendResponse({
            res,
            statusCode: 500,
            translationKey: "internal_server_error",  // Handle any internal server errors
            error: err,
        });
    }
});















router.use(auth);

// // Create a rate limiter for GlobalReferrals
// const apiRateLimiter = createRateLimiter("GlobalReferrals");
// const apiRateLimiterDetails = createRateLimiter("GlobalReferrals/:id");

// // Create a new GlobalReferral
// router.post("/", auth,roleMiddleware(["admin"]), createGlobalReferral);

// Get all GlobalReferrals with pagination
// router.get("/",  getGlobalReferrals);

// // Get all Users GlobalReferrals with pagination
// router.get("/users",roleMiddleware(["admin"]), apiRateLimiter, getUserGlobalReferrals);


// // //get GlobalReferral details
// // router.get("/:id", apiRateLimiterDetails, getGlobalReferralDetails);

// // Update an existing GlobalReferral
// router.put("/:id", roleMiddleware(["admin"]), updateGlobalReferral);
// // cancel user GlobalReferral
// router.put("/updateStatus/:id/:value", roleMiddleware(["admin"]), updateUserGlobalReferralStatus);

// // update user GlobalReferral
// router.put("/:userId/:id", roleMiddleware(["admin"]), updateUserGlobalReferral);


// // Delete a GlobalReferral
// router.delete("/:id", roleMiddleware(["admin"]), deleteGlobalReferral);

module.exports = router;
