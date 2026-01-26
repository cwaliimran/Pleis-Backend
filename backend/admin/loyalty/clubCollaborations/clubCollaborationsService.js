// services/clubCollaborationService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { generateMeta, validateParams, getReadableErrorMessage, sendResponse } = require("@utils/responseUtil");
const ClubCollaborations = require("@ClubCollaborationModel");
const clubCollaborationRepo = require("./clubCollaborationsRepository");
const mongoose = require("mongoose");
const { formatClubCollaborations } = require("./formatters/clubCollaborationFormatter");
const { cache, invalidate } = require("@redisCache");
const ACTIVE_LOYALTY_CLUB_COLLABORATION_CACHE_KEY = "loyaltyClubCollaboration:active";
const buildLoyaltyClubCollaborationCacheKey = ({
  scope = "public", // public | admin
  skip = 0,
  limit = 10
}) => {
  return `${ACTIVE_LOYALTY_CLUB_COLLABORATION_CACHE_KEY}:${scope}:skip=${skip}:limit=${limit}`;
};
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

  // If organizationId exists, use it; otherwise, fall back to userId.
  userId = organizationId || userId;
  const pipeline = [];

  // ----------------------------- USER FILTER -----------------------------
  if (status === "accepted") {
    pipeline.push({
      $match: {
        $or: [
          { "receiver.id": new mongoose.Types.ObjectId(userId) },
          { "sender.id": new mongoose.Types.ObjectId(userId) }
        ],
        "sender.status": "accepted"
      }
    });
  } else {
    // For other statuses (e.g., pending, rejected), only match receiverId and filter by sender's status.
    pipeline.push({
      $match: {
        ...(userId && { "receiver.id": new mongoose.Types.ObjectId(userId) }),
        "sender.status": { $ne: "deleted" }
      }
    });
  }

  // ----------------------------- STATUS FILTER -----------------------------
  if (status && status !== "accepted") {
    pipeline.push({
      $match: { "sender.status": status }
    });
  } else if (!status) {
    pipeline.push({
      $match: { "sender.status": { $ne: "deleted" } }
    });
  }

  // ----------------------------- DATE FILTER -----------------------------
  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

  // ----------------------------- KEYWORD FILTER -----------------------------
  const keywordMatch = buildKeywordQueryFromModels(
    [{ schema: ClubCollaborations.schema }],
    keyword
  );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }

  // ----------------------------- POPULATE SENDER AND RECEIVER -----------------------------
  // Populate the sender user details
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "sender.id",
      foreignField: "_id",
      as: "senderUser"
    }
  });

  // Populate the receiver user details
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "receiver.id",
      foreignField: "_id",
      as: "receiverUser"
    }
  });

  // ----------------------------- MERGE POPULATED USERS -----------------------------
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
              clubName: "$$u.companyDetails.loyaltySettings.title",
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
              clubName: "$$u.companyDetails.loyaltySettings.title",
              profileIcon: "$$u.profileIcon"
            }
          }
        }
      }
    }
  });

  // ----------------------------- REMOVE TEMP ARRAYS -----------------------------
  pipeline.push({
    $project: {
      senderUser: 0,
      receiverUser: 0
    }
  });

  // ----------------------------- SELECTIVE FIELD RETURN (SENDER OR RECEIVER) -----------------------------
  pipeline.push({
    $addFields: {
      selectedUserData: {
        $cond: {
          if: { $eq: ["$sender.id", new mongoose.Types.ObjectId(userId)] },
          then: "$receiver", // If user is sender, return receiver's data
          else: "$sender"    // If user is receiver, return sender's data
        }
      }
    }
  });

  // ----------------------------- REMOVE OTHER SIDE -----------------------------
  pipeline.push({
    $project: {
      sender: 0,
      receiver: 0
    }
  });

  // ----------------------------- PAGINATION + COUNTS -----------------------------
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });
  const result = await clubCollaborationRepo.getClubCollaborationsWithFilters(pipeline,skip,limit);

  const clubCollaborations = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Extra counts (e.g., total, active, inactive)
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

  // Check if sender exists and has a valid id
  if (clubCollaboration.sender && clubCollaboration.sender.id && clubCollaboration.sender.id._id) {
    const senderId = clubCollaboration.sender.id._id.toString(); // Ensure ObjectId is converted to 
    if (senderId === userId.toString()) {
      // Update the sender's status directly
      clubCollaboration.sender.status = data.status;
      clubCollaboration.receiver.status = data.status;
      updated = true;
    }
  } 

  // Check if receiver exists and has a valid id
  if (clubCollaboration.receiver && clubCollaboration.receiver.id && clubCollaboration.receiver.id._id) {
    const receiverId = clubCollaboration.receiver.id._id.toString(); // Ensure ObjectId is converted 
    if (receiverId === userId.toString()) {
      // Update the receiver's status directly
      clubCollaboration.receiver.status = data.status;
      clubCollaboration.sender.status = data.status;
      updated = true;
    }
  } 
  // If no valid update happened, throw an error
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
  const updated = await clubCollaborationRepo.findByIdAndDelete(id);
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