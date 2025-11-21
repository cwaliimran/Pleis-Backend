const { PromoCode } = require('@PromoCodeModel'); // Adjust path to your PromoCode model
const {User} = require('@UserModel');
const { buildKeywordQueryFromModels } = require('@utils/dbUtils/queryUtil');
const { generateMeta } = require('@utils/responseUtil');
const  FriendRequest  = require('@FriendRequestModel');
const mongoose = require("mongoose");
const { escapeRegex } = require("./formater/helper");
const getFriends = async ({
  timezone,
  page,
  limit,
  keyword,
  phoneCode,
  phoneDigits,
  status,
  userId,
  date
}) => {
const allRequests = await mongoose.model("FriendRequest").find({}).lean();
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [];
  console.log("⛳ Excluding myself…");
  pipeline.push({
    $match: {
      _id: { $ne: new mongoose.Types.ObjectId(userId) }
    }
  });
  // ---------------- PHONE DIGITS SEARCH ----------------
  if (phoneDigits) {
    const safeDigits = escapeRegex(phoneDigits);
    const keywordMatch = buildKeywordQueryFromModels([{ schema: User.schema }], safeDigits);

    if (Object.keys(keywordMatch).length) pipeline.push({ $match: keywordMatch });
  }

  // ---------------- PHONE CODE SEARCH ----------------
  if (phoneCode) {
    const safeCode = escapeRegex(phoneCode);
    const keywordMatch = buildKeywordQueryFromModels([{ schema: User.schema }], safeCode);

    if (Object.keys(keywordMatch).length) pipeline.push({ $match: keywordMatch });
  }
  if (keyword) {
    const safeKeyword = escapeRegex(keyword);
    const keywordMatch = buildKeywordQueryFromModels([{ schema: User.schema }], safeKeyword);

    if (Object.keys(keywordMatch).length) pipeline.push({ $match: keywordMatch });
  }
  pipeline.push({
  $lookup: {
    from: "friendrequests",
    let: {
      me: new mongoose.Types.ObjectId(userId),
      otherUserId: "$_id"
    },
    pipeline: [
      {
        $match: {
          $expr: {
            $or: [
              {
                $and: [
                  { $eq: ["$sender.id", "$$me"] },
                  { $eq: ["$receiver.id", "$$otherUserId"] }
                ]
              },
              {
                $and: [
                  { $eq: ["$sender.id", "$$otherUserId"] },
                  { $eq: ["$receiver.id", "$$me"] }
                ]
              }
            ]
          }
        }
      },
      { $project: { sender: 1, receiver: 1, createdAt: 1 } }
    ],
    as: "friendRequest"
  }
}

);
  console.log("🔥 Adding relationshipStatus logic");

  pipeline.push({
    $addFields: {
      relationshipStatus: {
        $switch: {
          branches: [
            {
              case: {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: "$friendRequest",
                        as: "req",
                        cond: {
                          $and: [
                            { $eq: ["$$req.sender.id", new mongoose.Types.ObjectId(userId)] },
                            { $eq: ["$$req.sender.status", "pending"] }
                          ]
                        }
                      }
                    }
                  },
                  0
                ]
              },
              then: "pending"
            },
            {
              case: {
                $gt: [
                  {
                    $size: {
                      $filter: {
                        input: "$friendRequest",
                        as: "req",
                        cond: {
                          $and: [
                            { $eq: ["$$req.receiver.id", new mongoose.Types.ObjectId(userId)] },
                            { $eq: ["$$req.receiver.status", "pending"] }
                          ]
                        }
                      }
                    }
                  },
                  0
                ]
              },
              then: "accept"
            }
          ],
          default: "send"
        }
      }
    }
  });
  pipeline.push({
    $project: {
      firstName: 1,
      lastName: 1,
      username: 1,
      phoneNumber: 1,
      profileIcon: 1,
      relationshipStatus: 1,

    }
  });
  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });


  const result = await User.aggregate(pipeline);


  const users = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;



  const meta = generateMeta(page, limit, totalFiltered);



  return { users, meta };
};
const createFriendRequest = async (data) => {
  try {
    const { userId, friendUserId, notes } = data;

    const friendRequest = new FriendRequest({
      sender: { id: userId },
      receiver: { id: friendUserId },
      notes,
    });

    await friendRequest.save();

    return friendRequest;
  } catch (err) {
    throw err;
  }
};

const getFriendRequests = async ({ page, limit, userId, status }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
console.log("userID",userId );
  const me = new mongoose.Types.ObjectId(userId);


const pipeline = [
  {
    $match: {
      "receiver.id": me,
      "receiver.status": status
    }
  },

  {
    $lookup: {
      from: "users",
      let: { senderId: "$sender.id" },
      pipeline: [
        {
          $match: {
            $expr: { $eq: ["$_id", "$$senderId"] }
          }
        },
        {
          $project: {
            firstName: 1,
            lastName: 1,
            phoneNumber: 1,
            profileIcon: 1
          }
        }
      ],
      as: "senderDetails"
    }
  },

  { $unwind: "$senderDetails" },

  {
    $project: {
      _id: 1, // friend request ID
      firstName: "$senderDetails.firstName",
      lastName: "$senderDetails.lastName",
      phoneNumber: "$senderDetails.phoneNumber",
      profileIcon: "$senderDetails.profileIcon"
    }
  },

  { $sort: { createdAt: -1 } },

  {
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  }
];


  const result = await FriendRequest.aggregate(pipeline);


  const requests = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  return {
    requests,
    meta: {
      page,
      limit,
      totalRecords: totalFiltered,
      totalPages: limit === 0 ? 1 : Math.ceil(totalFiltered / limit)
    }
  };
};






const updateFriendRequests = async ({  id, status, userId }) => {
console.log("status",status );
  const friendRequest = await FriendRequest.findById(id);
console.log("friendRequest",friendRequest );

  if (!friendRequest) {
    return { error: "friend_request_not_found" };
  }

  if (friendRequest.receiver.id.toString() !== userId) {
    return { error: "user_not_involved" };  
  }


if (friendRequest.receiver.id.toString() === userId) {
    friendRequest.receiver.status = status;
    friendRequest.sender.status = status; 
  }

  try {
    await friendRequest.save();
    return { message: "Friend request status updated successfully", friendRequest };
  } catch (error) {
    return { error: "Error updating friend request" };  // Error handling if save fails
  }
};
const getFriendRequestById = async (id) => {
  return FriendRequest.findById(id);
};

const unfriend = async (id, userId) => {
  try {
    const friendRequest = await getFriendRequestById(id);
    console.log("Fetched FriendRequest:", friendRequest);

    if (!friendRequest) {
      console.log("Error: Friend request not found");
      return { error: "friend_request_not_found" };
    }

    // Check if the user is either the sender or receiver
    if (
      friendRequest.sender.id.toString() !== userId.toString() &&
      friendRequest.receiver.id.toString() !== userId.toString()
    ) {
      console.log("Error: User not involved in this request");
      return { error: "user_not_involved" }; // User is neither sender nor receiver
    }

    // Check if the status is "accepted" before allowing deletion
    if (friendRequest.sender.status !== "accept" && friendRequest.receiver.status !== "accept") {
      console.log("Error: Cannot delete request, it is not accepted");
      return { message: "Cannot delete request, it is not accepted" };
    }

    // Log before deletion
    console.log(`Deleting friend request with ID: ${id} and userID: ${userId}`);

    // Delete the friend request entry from the database
    const result = await FriendRequest.deleteOne({ _id: id });
    console.log("Deletion result:", result);

    if (result.deletedCount === 0) {
      console.log("Error: Friend request not found for deletion");
      return { error: "friend_request_not_found" };
    }

    console.log("Success: Friend request deleted successfully");
    return { message: "Friend request deleted successfully" };
  } catch (error) {
    console.log("Error deleting friend request:", error);
    return { error: "Error deleting friend request" };
  }
};



module.exports = {
  getFriends,
  createFriendRequest,
  getFriendRequests,
  getFriendRequestById,
  updateFriendRequests,
  unfriend,
};
