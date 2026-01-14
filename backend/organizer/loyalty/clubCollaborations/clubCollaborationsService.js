// services/clubCollaborationService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const ClubCollaborations = require("@ClubCollaborationModel");
const clubCollaborationRepo = require("./clubCollaborationsRepository");
const mongoose = require("mongoose");

const createClubCollaboration = async (req, res) => {
  const {
    sender,
    receiver,
    notes,
    expiryDate,
  } = req.body;

  // Validate required fields
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


// Populate club data for clubCollaborations (updated for new schema)
const getClubCollaborations = async ({ page, limit, keyword, status, userId, date }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    {
      $match: {
        ...(userId && { "sender.id": new mongoose.Types.ObjectId(userId) })
      }
    }
  ];

  // 🔹 Status filter (sender.status)
  if (status) {
    pipeline.push({ $match: { "sender.status": status } });
  } else {
    pipeline.push({ $match: { "sender.status": { $ne: "deleted" } } });
  }

  // 🔹 Date filter
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  // 🔹 Keyword filter
  const keywordMatch = buildKeywordQueryFromModels(
    [{ schema: ClubCollaborations.schema }],
    keyword
  );
  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }

  pipeline.push({ $sort: { createdAt: -1 } });

  // 🔹 Lookup sender user
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "sender.id",
      foreignField: "_id",
      pipeline: [
        { $project: { "companyDetails.name": 1, "companyDetails.representativeName": 1 } }
      ],
      as: "senderUser"
    }
  });

  // 🔹 Lookup receiver user
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "receiver.id",
      foreignField: "_id",
      pipeline: [
        { $project: { "companyDetails.name": 1, "companyDetails.representativeName": 1 } }
      ],
      as: "receiverUser"
    }
  });

  // 🔹 Merge user info WITHOUT losing status
  pipeline.push({
    $addFields: {
      sender: {
        id: "$sender.id",
        status: "$sender.status",
        user: { $arrayElemAt: ["$senderUser", 0] }
      },
      receiver: {
        id: "$receiver.id",
        status: "$receiver.status",
        user: { $arrayElemAt: ["$receiverUser", 0] }
      }
    }
  });

  // 🔹 Cleanup temp arrays
  pipeline.push({
    $project: {
      senderUser: 0,
      receiverUser: 0
    }
  });

  // 🔹 Pagination + count
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  const result = await clubCollaborationRepo.getClubCollaborationsWithFilters(pipeline);

  const clubCollaborations = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered?.[0]?.count || 0;

  // 🔹 Meta counts
  const [total, active, inactive] = await Promise.all([
    ClubCollaborations.countDocuments({
      ...(userId && { "sender.id": userId }),
      "sender.status": { $ne: "deleted" }
    }),
    ClubCollaborations.countDocuments({
      ...(userId && { "sender.id": userId }),
      "sender.status": "accepted"
    }),
    ClubCollaborations.countDocuments({
      ...(userId && { "sender.id": userId }),
      "sender.status": "rejected"
    })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.clubCollaborationsCount = { total, active, inactive };

  return {
    clubCollaborations,
    meta
  };
};


const updateClubCollaboration = async (id, data, userId) => {
  const clubCollaboration = await clubCollaborationRepo.findClubCollaborationById(id);

  if (!clubCollaboration) {
    throw new Error("Collaboration request not found");
  }

  let updated = false;

  // Check if the requesting user is the sender
  if (clubCollaboration.sender.id.toString() === userId.toString()) {
    // Update the sender's status directly
    clubCollaboration.sender.status = data.status;
    clubCollaboration.receiver.status = data.status;
    updated = true;
  }

  // Check if the requesting user is the receiver
  if (clubCollaboration.receiver.id.toString() === userId.toString()) {
    // Update the receiver's status directly
    clubCollaboration.receiver.status = data.status;
    clubCollaboration.sender.status = data.status;
    updated = true;
  }

  // If no valid update happened
  if (!updated) {
    throw new Error("You do not have permission to update this collaboration status");
  }

  // Update other allowed fields (e.g., notes, expiryDate)
  const allowedFields = ["notes", "expiryDate"];
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      clubCollaboration[key] = data[key];
    }
  }

  // Save updated collaboration
  await clubCollaboration.save();
  return clubCollaboration;
};


const deleteClubCollaboration = async (id) => {
  const updated = await clubCollaborationRepo.findByIdAndUpdate(id, {
    "sender.status": "deleted",
  });
  if (!updated) return null;
  return true;
};

const getClubCollaborationDetails = async (id) => {
  const clubCollaboration = await clubCollaborationRepo.findClubCollaborationById(id).populate('sender.id receiver.id');
  if (!clubCollaboration) return null;
  return clubCollaboration;
};

module.exports = {
  createClubCollaboration,
  getClubCollaborations,
  updateClubCollaboration,
  getClubCollaborationDetails,
  deleteClubCollaboration,
};