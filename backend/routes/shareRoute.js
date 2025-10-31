const express = require("express");
const { sendResponse, validateParams, convertUtcToTimezone } = require("../helperUtils/responseUtil");
const { Events } = require("../commonModules/events/Event");
const Organizations = require("../commonModules/organizations/Organization");
const Venues = require("../commonModules/venues/Venues");


const router = express.Router();


// ✅ Base web URL for universal links
const BASE_WEB_URL = process.env.API_BASE_URL;

/**
 * Helper to get model dynamically by type
 */
function getModelByType(type) {
    switch (type) {
        case "event":
            return Events;
        case "organization":
            return Organizations;
        case "venue":
            return Venues;
        default:
            return null;
    }
}

/**
 * Helper to generate one universal share URL
 * Example: https://pleisapp.com/open?type=event&id=XYZabc123
 */
function generateShareLink(type, publicId) {
    return `${BASE_WEB_URL}share?type=${type}&id=${publicId}`;
}

/**
 * ✅ Generate shareable link
 * Example: GET /api/share/event/68ff18ed8cd2d2f52b25be1a
 * Uses Mongo _id (uuid) → returns link with publicId
 */
router.get("/:type/:id", async (req, res) => {
    try {

        const { type, id } = req.params;

        if (
            !validateParams(req, res, {
                pathParams: ["id"],
                objectIdFields: ["id"],
            })
        ) return;

        const model = getModelByType(type);
        if (!model) {
            return sendResponse({
                res,
                statusCode: 400,
                translationKey: "invalid_type",
            });
        }

        const doc = await model.findById(id).select("publicId status");

        if (!doc) {
            return sendResponse({
                res,
                statusCode: 404,
                translationKey: `${type}_not_found`,
            });
        }

        if (doc.status && doc.status !== "active") {
            return sendResponse({
                res,
                statusCode: 400,
                translationKey: `${type}_not_active`,
            });
        }

        const shareUrl = generateShareLink(type, doc.publicId);

        return sendResponse({
            res,
            statusCode: 200,
            translationKey: "share_link_generated_successfully",
            data: {
                type,
                id: doc.publicId,
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

/**
 * ✅ Handle shared link hit
 * Example: GET /api/share/open?type=event&id=abc123XYZ
 * Uses publicId → returns event details (for app users)
 * Or auto-redirects to app / store when opened in browser
 */
router.get("/", async (req, res) => {
    try {
        const { type, id } = req.query;

        if (!type || !id) {
            return sendResponse({
                res,
                statusCode: 400,
                translationKey: "invalid_parameters",
            });
        }

        const model = getModelByType(type);
        if (!model) {
            return sendResponse({
                res,
                statusCode: 400,
                translationKey: "invalid_type",
            });
        }

        const doc = await model.findOne({ publicId: id }).select("_id publicId status");
        if (!doc) {
            return sendResponse({
                res,
                statusCode: 404,
                translationKey: `${type}_not_found`,
            });
        }

        const appLink = `pleisapp://${type}/${doc.publicId}`;
        const iosFallback = "https://apps.apple.com/app/pleisapp/id1234567890";
        const androidFallback = "https://play.google.com/store/apps/details?id=com.pleisapp";

        // Smart redirect HTML
        return res.send(`
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Opening ${type}...</title>
          <script>
            function openApp() {
              const appLink = '${appLink}';
              const iosFallback = '${iosFallback}';
              const androidFallback = '${androidFallback}';
              const userAgent = navigator.userAgent || navigator.vendor || window.opera;
              window.location = appLink;
              setTimeout(() => {
                if (/android/i.test(userAgent)) {
                  window.location = androidFallback;
                } else if (/iPad|iPhone|iPod/.test(userAgent) && !window.MSStream) {
                  window.location = iosFallback;
                } else {
                  window.location = 'https://pleisapp.com';
                }
              }, 1500);
            }
            window.onload = openApp;
          </script>
        </head>
        <body>
          <p style="text-align:center;margin-top:40vh;font-family:sans-serif;">
            Opening <b>${type}</b>...
          </p>
        </body>
      </html>
    `);
    } catch (err) {
        console.error("Error resolving shared link:", err);
        return sendResponse({
            res,
            statusCode: 500,
            translationKey: "internal_server_error",
            error: err,
        });
    }
});



module.exports = router;
