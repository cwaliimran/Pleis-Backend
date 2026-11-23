const express = require("express");
const {
  sendResponse,
  validateParams,


} = require("../../helperUtils/responseUtil");
const GlobalReferral = require("@GlobalReferralSettingsModel");
const {

  getGlobalReferrals,
createUserReferradrecord,
    saveReferralData,

getUserReferradrecord,
  saveUserReferralData
} = require("./globalReferralController");

const auth = require("../../middlewares/authMiddleware");
const { resolvePleisAppScheme, buildPleisLink } = require("../../config/CONSTANTS");
const { sendSmartOpen } = require("../../helperUtils/appDeepLinkUtil");


const router = express.Router();



router.post("/", createUserReferradrecord);
router.get("/history", auth,getUserReferradrecord);


  






/**
 * Helper to get model dynamically by type
 */
function getModelByType(type) {
    switch (type) {
        case "global":
            return GlobalReferralSettings;
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
 * Referral share URL on the Pleis link base (PLEIS_LINK_BASE_URL).
 * Example: <link base>api/v1/app/global-referral/share?id=<username>
 */
function generateShareLink(result) {
    return buildPleisLink(`api/v1/app/global-referral/share?id=${encodeURIComponent(result)}`);
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


router.get("/share", async (req, res) => {
    try {
        const username = typeof req.query.id === "string" ? req.query.id.trim() : "";
        if (!username) {
            return sendResponse({
                res,
                statusCode: 400,
                translationKey: "invalid_parameters",
            });
        }

        // Records the click against this IP. A missing referrer must not stop
        // the open page — the app still has to open, the way other share links do.
        await saveUserReferralData(username, req.ip);

        // saveUserReferralData returns a record, not a path. The app scheme
        // has to be a real route (`com.pleis://referral/<username>`), which
        // the guest app opens onto sign-up with the code filled in.
        const appLink = `${resolvePleisAppScheme()}://referral/${encodeURIComponent(username)}`;
        return sendSmartOpen(req, res, { appLink, title: "PLEIS" });
    } catch (err) {
        return sendResponse({
            res,
            statusCode: 500,
            translationKey: "internal_server_error",
            error: err,
        });
    }
});















router.use(auth);

// // Create a rate limiter for GlobalReferrals
// const apiRateLimiter = createRateLimiter("GlobalReferrals");
// const apiRateLimiterDetails = createRateLimiter("GlobalReferrals/:id");

// // Create a new GlobalReferralSettings
// router.post("/", auth,roleMiddleware(["admin"]), createGlobalReferral);

// Get all GlobalReferrals with pagination
router.get("/",  getGlobalReferrals);

// // Get all Users GlobalReferrals with pagination
// router.get("/users",roleMiddleware(["admin"]), apiRateLimiter, getUserGlobalReferrals);


// // //get GlobalReferralSettings details
// // router.get("/:id", apiRateLimiterDetails, getGlobalReferralDetails);

// // Update an existing GlobalReferralSettings
// router.put("/:id", roleMiddleware(["admin"]), updateGlobalReferralSettings);
// // cancel user GlobalReferralSettings
// router.put("/updateStatus/:id/:value", roleMiddleware(["admin"]), updateUserGlobalReferralStatus);

// // update user GlobalReferral
// router.put("/:userId/:id", roleMiddleware(["admin"]), updateUserGlobalReferral);


// // Delete a GlobalReferralSettings
// router.delete("/:id", roleMiddleware(["admin"]), deleteGlobalReferralSettings);

module.exports = router;
