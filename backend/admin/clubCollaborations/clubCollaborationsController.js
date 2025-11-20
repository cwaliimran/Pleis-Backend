const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
} = require("@utils/responseUtil");

const clubCollaborationsService = require("./clubCollaborationsService");


const createClubCollaboration = async (req, res) => {
  const {
    sender,
    receiver,
    notes,
    expiryDate,
  } = req.body;

  if (
    !validateParams(req, res, {
      rawData: ["sender", "receiver"],
    })
  ) return;

  // Set initial status as 'pending' for both sender and receiver
  let data = {
    sender: { id: sender, status: "pending" },
    receiver: { id: receiver, status: "pending" },
    notes,
    expiryDate,
  };

  try {
    // Check if the collaboration already exists between the same sender and receiver
    const existing = await clubCollaborationsService.getClubCollaborations({
      page: 1,
      limit: 1,
      keyword: "",
      status: { $ne: "deleted" },
      date: null,
      userId: sender,
      receiverId: receiver,
    });

    if (existing.clubCollaborations.length > 0) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "club_collaboration_already_exists",
      });
    }

    // Create the collaboration
    const clubCollaboration = await clubCollaborationsService.createClubCollaboration(data);
    if (!clubCollaboration) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "club_collaboration_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "club_collaboration_created_successfully",
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

const getClubCollaborations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status = "pending", date } = req.query;
  try {
    const { clubCollaborations, meta } = await clubCollaborationsService.getClubCollaborations({
      page,
      limit,
      keyword,
      status,
      date,
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
  const userId = req.body.userId;

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