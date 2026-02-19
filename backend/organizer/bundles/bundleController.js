
const { sendResponse, getReadableErrorMessage, validateParams, convertTimezoneToUtc, parsePaginationParams } = require("@utils/responseUtil");
const { createBundleService,
  getBundlesService,
  getBundleByIdService,
  updateBundleService,
  deleteBundleService, } = require("./bundleService");

const createBundle = async (req, res) => {
  try {
    const { timezone, _id: userId } = req.user;
    const {
      organization,
      name,
      description,
      originalPrice,
      discountedPrice,
      discountPercentage,
      startDate,
      endDate,
      event,
      bundleDetails = {},
    } = req.body;

    // ==============================
    // STEP 1: PREPARE VALIDATION DATA
    // ==============================
    const validateData = {
      rawData: ["organization", "name", "originalPrice", "discountedPrice", "discountPercentage", "startDate", "endDate"],
      objectIdFields: ["organization", "event"],
      dateFields: {
        startDate: "YYYY-MM-DD hh:mm A",
        endDate: "YYYY-MM-DD hh:mm A",
      },
    };

    // Validate bundleDetails arrays
    if (bundleDetails.ticketings?.length > 0) {
      bundleDetails.ticketings.forEach((t, idx) => {
        validateData.objectIdFields.push(`bundleDetails.ticketings.${idx}.ticketType`);
        validateData.rawData.push(`bundleDetails.ticketings.${idx}.quantity`);
      });
    }

    if (bundleDetails.reservations?.length > 0) {
      bundleDetails.reservations.forEach((r, idx) => {
        validateData.objectIdFields.push(`bundleDetails.reservations.${idx}.reservationType`);
        validateData.rawData.push(`bundleDetails.reservations.${idx}.quantity`);
      });
    }

    if (bundleDetails.preOrderItems?.length > 0) {
      bundleDetails.preOrderItems.forEach((p, idx) => {
        validateData.objectIdFields.push(`bundleDetails.preOrderItems.${idx}.menuItem`);
        validateData.rawData.push(`bundleDetails.preOrderItems.${idx}.quantity`);
      });
    }

    // ==============================
    // STEP 2: VALIDATE ALL FIELDS
    // ==============================
    if (!validateParams(req, res, validateData)) return;

    // ==============================
    // STEP 3: CONVERT DATES TO UTC
    // ==============================
    const bundlePayload = {
      organization,
      name: name.trim(),
      description: description?.trim() || "",
      originalPrice,
      discountedPrice,
      discountPercentage,
      startDate: convertTimezoneToUtc(startDate, timezone, "YYYY-MM-DD hh:mm A"),
      endDate: convertTimezoneToUtc(endDate, timezone, "YYYY-MM-DD hh:mm A"),
      event: event || null,
      bundleDetails: bundleDetails || {},
      creator: userId,
    };

    // ==============================
    // STEP 4: CREATE BUNDLE
    // ==============================
    const bundle = await createBundleService(bundlePayload, timezone);
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "bundle_created_successfully",
      data: bundle,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};

const getBundles = async (req, res) => {
  try {
    const { page, limit } = parsePaginationParams(req);
    const { keyword, status, date, orderSort,organization } = req.query;
    let { timezone } = req.user;
    companyOrganizer=req.user._id;


    const bundles = await getBundlesService({ page, limit, keyword, status, date, orderSort, timezone, organization,companyOrganizer });
    return sendResponse({ res, statusCode: 200, translationKey: "bundles_fetched_successfully", data: bundles });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

const getBundleById = async (req, res) => {
  try {
    let { timezone } = req.user;
    const bundle = await getBundleByIdService(req.params.id, timezone);
    if (!bundle) return sendResponse({ res, statusCode: 404, translationKey: "bundle_not_found" });
    return sendResponse({ res, statusCode: 200, translationKey: "bundle_fetched_successfully", data: bundle });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

const updateBundle = async (req, res) => {
  try {
    const { timezone } = req.user;
    const bundle = await updateBundleService(req.params.id, req.body, timezone);
    return sendResponse({ res, statusCode: 200, translationKey: "bundle_updated_successfully", data: bundle });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

const deleteBundle = async (req, res) => {
  try {
    const bundle = await deleteBundleService(req.params.id);
    return sendResponse({ res, statusCode: 200, translationKey: "bundle_deleted_successfully", data: bundle });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({ res, statusCode: readableError.statusCode, translationKey: readableError.message, error });
  }
};

module.exports = { createBundle, getBundles, getBundleById, updateBundle, deleteBundle };