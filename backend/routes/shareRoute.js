const express = require("express");
const { sendResponse, validateParams, convertUtcToTimezone } = require("../helperUtils/responseUtil");
const { Events } = require("../commonModules/events/Event");
const Organizations = require("../commonModules/organizations/Organization");
const Venues = require("../commonModules/venues/Venues");
const { resolvePleisAppScheme } = require("../config/CONSTANTS");
const { renderSmartOpenHtml } = require("../helperUtils/appDeepLinkUtil");


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

        const appLink = `${resolvePleisAppScheme()}://${type}/${doc.publicId}`;

        // Smart redirect HTML
        return res.send(renderSmartOpenHtml({ appLink, title: type }));
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
