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
const { resolvePleisAppScheme, buildPleisLink } = require("../../config/CONSTANTS");
const { sendSmartOpen } = require("../../helperUtils/appDeepLinkUtil");


const router = express.Router();



// router.post("/", createUserReferradrecord);
// router.get("/history", auth,getUserReferradrecord);


  






/**
 * Helper to get model dynamically by type
 */


/**
 * Loyalty referral share URL on the Pleis link base (PLEIS_LINK_BASE_URL).
 * Example: <link base>api/v1/app/loyalty-referral/share?organizer=<publicId>&user=<publicId>
 */
function generateShareLink(organizationPublicId, userPublicId) {
    return buildPleisLink(
        `api/v1/app/loyalty-referral/share?organizer=${encodeURIComponent(organizationPublicId)}&user=${encodeURIComponent(userPublicId)}`
    );
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

        const appLink = `${resolvePleisAppScheme()}://organizer=${result.organizerId}/referrer=${result.referrerId}`;

        // Opens the app (Android: straight intent redirect) or the store
        return sendSmartOpen(req, res, { appLink, title: "PLEIS" });
    } catch (err) {
        
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
