const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const clubCollaborationsService = require("./clubCollaborationsService");


const createClubCollaboration = async (req, res) => {
  const { sender, receiver, notes, expiryDate } = req.body;

  if (
    !validateParams(req, res, {
      rawData: ["sender", "receiver"],
    })
  ) return;

  try {
    const result = await clubCollaborationsService.createClubCollaboration({
      sender,
      receiver,
      notes,
      expiryDate
    });

    // Already exists
    if (result.exists) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "club_collaboration_already_exists",
      });
    }

    // Check creation failure
    if (!result.clubCollaboration) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "club_collaboration_creation_failed",
      });
    }

    // Success
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "club_collaboration_created_successfully",
      data: result.clubCollaboration,
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


const getClubCollaborations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
   const { organizationId } = req.params;
  const { keyword, status = "pending", date } = req.query;
  try {
    console.log("organizationId", organizationId);
    const { clubCollaborations, meta } = await clubCollaborationsService.getClubCollaborations({
      page,
      limit,
      keyword,
      status,
      date,
      organizationId
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "club_collaborations_fetched_successfully",
      data: clubCollaborations,
      meta,
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

const getClubCollaborationDetails = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const clubCollaboration = await clubCollaborationsService.getClubCollaborationDetails(id).populate('sender.id receiver.id');
    if (!clubCollaboration) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "club_collaboration_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "club_collaboration_details_fetched_successfully",
      data: clubCollaboration,
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



const updateClubCollaboration = async (req, res) => {
  const { id } = req.params;
  const { status, notes, expiryDate } = req.body;
  const userId = req.user.id; // Get the authenticated user ID

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  ) return;

  let data = {
    status,     // Dynamically set the status (accept/reject/expire)
    notes,
    expiryDate,
  };

  try {
    const updated = await clubCollaborationsService.updateClubCollaboration(id, data, userId);

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "club_collaboration_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "club_collaboration_updated_successfully",
      data: updated,
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


const deleteClubCollaboration = async (req, res) => {
  const { id } = req.params;

  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )
    return;

  try {
    const deleted = await clubCollaborationsService.deleteClubCollaboration(id);
    if (!deleted) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "club_collaboration_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "club_collaboration_deleted_successfully",
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

module.exports = {
  createClubCollaboration,
  getClubCollaborations,
  updateClubCollaboration,
  deleteClubCollaboration,
  getClubCollaborationDetails,
};