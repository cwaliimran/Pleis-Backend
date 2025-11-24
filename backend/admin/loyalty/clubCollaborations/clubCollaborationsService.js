// services/clubCollaborationService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { generateMeta, validateParams, getReadableErrorMessage, sendResponse } = require("@utils/responseUtil");
const ClubCollaborations = require("@ClubCollaborationModel");
const clubCollaborationRepo = require("./clubCollaborationsRepository");
const mongoose = require("mongoose");
const { formatClubCollaborations } = require("./formatters/clubCollaborationFormatter");

const createClubCollaboration = async ({ sender, receiver, notes, expiryDate }) => {
  // Check existing
  const existing = await clubCollaborationRepo.checkExistingCollaboration({
    senderId: sender,
    receiverId: receiver
  });

  if (existing) {
    return { exists: true };
  }

  // Create new
  const data = {
    sender: { id: sender, status: "pending" },
    receiver: { id: receiver, status: "pending" },
    notes,
    expiryDate,
  };

  const clubCollaboration = await clubCollaborationRepo.createClubCollaboration(data);

  return { exists: false, clubCollaboration };
};

module.exports = {
  createClubCollaboration
};



// Populate club data for clubCollaborations (updated for new schema)
const getClubCollaborations = async ({ page, limit, keyword, status, userId, date, organizationId }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  userId = organizationId || userId;
  const pipeline = [];
  console.log("user ID ", organizationId);
  // -----------------------------
  // USER FILTER
  // -----------------------------
  pipeline.push({
    $match: {
      ...(userId && { "receiver.id": new mongoose.Types.ObjectId(userId) })
    }
  });

  // -----------------------------
  // STATUS FILTER
  // -----------------------------
  if (status) {
    pipeline.push({
      $match: { "sender.status": status }
    });
  } else {
    pipeline.push({
      $match: { "sender.status": { $ne: "deleted" } }
    });
  }

  // -----------------------------
  // DATE FILTER
  // -----------------------------
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  // -----------------------------
  // KEYWORD FILTER
  // -----------------------------
  const keywordMatch = buildKeywordQueryFromModels(
    [{ schema: ClubCollaborations.schema }],
    keyword
  );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }

  // SORT
  pipeline.push({ $sort: { createdAt: -1 } });

  // -----------------------------
  // POPULATE SENDER USER
  // -----------------------------
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "sender.id",
      foreignField: "_id",
      as: "senderUser"
    }
  });

  // -----------------------------
  // POPULATE RECEIVER USER
  // -----------------------------
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "receiver.id",
      foreignField: "_id",
      as: "receiverUser"
    }
  });

  // -----------------------------
  // MERGE POPULATED USERS INTO STRUCTURE
  // -----------------------------
  pipeline.push({
    $addFields: {
      sender: {
        id: "$sender.id",
        status: "$sender.status",
        user: {
          $let: {
            vars: { u: { $arrayElemAt: ["$senderUser", 0] } },
            in: {
              _id: "$$u._id",
              firstName: "$$u.firstName",
              lastName: "$$u.lastName",
              profileIcon: "$$u.profileIcon"
            }
          }
        }
      },
      receiver: {
        id: "$receiver.id",
        status: "$receiver.status",
        user: {
          $let: {
            vars: { u: { $arrayElemAt: ["$receiverUser", 0] } },
            in: {
              _id: "$$u._id",
              firstName: "$$u.firstName",
              lastName: "$$u.lastName",
              profileIcon: "$$u.profileIcon"
            }
          }
        }
      }
    }
  });

  // Remove temp arrays
  pipeline.push({
    $project: {
      senderUser: 0,
      receiverUser: 0
    }
  });

  // -----------------------------
  // PAGINATION + COUNTS
  // -----------------------------
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
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Extra counts
  const [total, active, inactive] = await Promise.all([
    ClubCollaborations.countDocuments({
      ...(userId && { "sender.id": userId }),
      "sender.status": { $ne: "deleted" }
    }),
    ClubCollaborations.countDocuments({
      "sender.status": "accepted",
      ...(userId && { "sender.id": userId })
    }),
    ClubCollaborations.countDocuments({
      "sender.status": "rejected",
      ...(userId && { "sender.id": userId })
    })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.clubCollaborationsCount = { total, active, inactive };

  let formatted = formatClubCollaborations(clubCollaborations);

  return {
    clubCollaborations: formatted,
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
    updated = true;
  }

  // Check if the requesting user is the receiver
  if (clubCollaboration.receiver.id.toString() === userId.toString()) {
    // Update the receiver's status directly
    clubCollaboration.receiver.status = data.status;
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
  const clubCollaboration = await clubCollaborationRepo.findClubCollaborationById(id);
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