const express = require("express");
const { sendResponse, validateParams } = require("../helperUtils/responseUtil");
const { getShareCode, getShareCodeByPublicId } = require("../commonModules/qrCode/qrLinks");

const router = express.Router();

/**
 * Share button (#83, Defects Report D-13).
 * GET /share/:type/:id   type: organization | venue | event | loyaltyClub | reservation
 *
 * The shared link is the same deep link as the content's QR code
 * (`<link base>q/<token>`): it opens the app on that screen, or the store
 * when the app is not installed.
 */
router.get("/:type/:id", async (req, res) => {
  try {
    if (
      !validateParams(req, res, {
        pathParams: ["id"],
        objectIdFields: ["id"],
      })
    ) return;

    const { type, id } = req.params;
    const code = await getShareCode({ type, id, userId: req.user?._id });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "share_link_generated_successfully",
      data: {
        type,
        // Not "token": the app would take it for its session token.
        qrToken: code.token,
        shareUrl: code.link,
      },
    });
  } catch (err) {
    return sendResponse({
      res,
      statusCode: err?.statusCode || 500,
      translationKey: err?.statusCode ? err.message : "internal_server_error",
      error: err,
    });
  }
});

/**
 * Links sent before #83 (`share?type=event&id=<publicId>`): forward to the
 * content's current link, which opens the app or the store.
 */
router.get("/", async (req, res) => {
  try {
    const { type, id } = req.query;
    const code = await getShareCodeByPublicId({ type, publicId: id });
    if (!code?.link) {
      return sendResponse({ res, statusCode: 404, translationKey: "invalid_parameters" });
    }
    return res.redirect(302, code.link);
  } catch (err) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server_error",
      error: err,
    });
  }
});

module.exports = router;
