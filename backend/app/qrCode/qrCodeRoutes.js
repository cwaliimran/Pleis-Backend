const express = require("express");
const {
  sendResponse,
  validateParams,


} = require("../../helperUtils/responseUtil");
const GlobalReferralSettings = require("@GlobalReferralSettingsModel");


const auth = require("../../middlewares/authMiddleware");
const { resolvePleisAppScheme, buildPleisLink } = require("../../config/CONSTANTS");
const { sendSmartOpen } = require("../../helperUtils/appDeepLinkUtil");


const { resolveToken, getShareCodeByPublicId } = require("../../commonModules/qrCode/qrLinks");
const createRateLimiter = require("../../helperUtils/rateLimiter");

const router = express.Router();

/**
 * Resolves a QR / share deep link for the app (#82, #83).
 *   GET /app/qr-code/resolve/<token>
 *   GET /app/qr-code/resolve?type=event&id=<publicId>   (links sent before #83)
 * → { type: organization|event|loyaltyClub|checkIn|table|reservation,
 *     organizationId, venueId, eventId, loyaltyClubId, reservationId,
 *     table: { deliveryOptionId, code, label } }
 * 404 when the code is unknown or revoked.
 */
const sendResolved = (res, resolved) =>
  resolved
    ? sendResponse({ res, statusCode: 200, translationKey: "qr_code_resolved_successfully", data: resolved })
    : sendResponse({ res, statusCode: 404, translationKey: "qr_code_not_valid" });

router.get("/resolve/:token", createRateLimiter("QrResolve"), async (req, res) => {
  try {
    return sendResolved(res, await resolveToken(req.params.token));
  } catch (err) {
    return sendResponse({ res, statusCode: 500, translationKey: "internal_server_error", error: err });
  }
});

router.get("/resolve", createRateLimiter("QrResolve"), async (req, res) => {
  try {
    const code = await getShareCodeByPublicId({ type: req.query.type, publicId: req.query.id });
    return sendResolved(res, code ? await resolveToken(code.token) : null);
  } catch (err) {
    return sendResponse({ res, statusCode: 500, translationKey: "internal_server_error", error: err });
  }
});

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


router.get("/", async (req, res) => {

    try {
        const { id } = req.query; 
        const username=id;

const result = await saveUserReferralData(username, req.ip);
        const appLink = `${resolvePleisAppScheme()}://${result}`;

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



module.exports = router;
