const { User } = require('@UserModel');
const { buildKeywordQueryFromModels } = require('@utils/dbUtils/queryUtil');
const { generateMeta } = require('@utils/responseUtil');
const FriendRequest = require('@FriendRequestModel');
const mongoose = require("mongoose");
const { escapeRegex } = require("./formater/helper");
const { sendUserNotifications } = require('../../controllers/communicationController');
const { NotificationTypes } = require('@NotificationsModel');
const getFriends = async ({
  page,
  limit,
  keyword,
  userId,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [
    // 1️⃣ Exclude self
    {
      $match: {
        _id: { $ne: new mongoose.Types.ObjectId(userId) },
      },
    },
  ];
  console.log("keyword", keyword);
  // 2️⃣ Keyword search
  if (keyword) {
    const safeKeyword = escapeRegex(keyword);

    pipeline.push({
      $match: {
        username: safeKeyword,

      },
    });
  }


  // 3️⃣ Lookup ONLY accepted friend requests
  pipeline.push({
    $lookup: {
      from: "friendrequests",
      let: {
        me: new mongoose.Types.ObjectId(userId),
        otherUserId: "$_id",
      },
      pipeline: [
        {
          $match: {
            $expr: {
              $and: [
                {
                  $or: [
                    {
                      $and: [
                        { $eq: ["$sender.id", "$$me"] },
                        { $eq: ["$receiver.id", "$$otherUserId"] },
                      ],
                    },
                    {
                      $and: [
                        { $eq: ["$sender.id", "$$otherUserId"] },
                        { $eq: ["$receiver.id", "$$me"] },
                      ],
                    },
                  ],
                },
                { $eq: ["$sender.status", "accept"] },
                { $eq: ["$receiver.status", "accept"] },
              ],
            },
          },
        },
        { $limit: 1 },
      ],
      as: "friendRequest",
    },
  });
  if (!keyword) {
    // 4️⃣ KEEP ONLY USERS WHO ARE FRIENDS
    pipeline.push({
      $match: {
        $expr: { $gt: [{ $size: "$friendRequest" }, 0] },
      },
    });
  }

  // 5️⃣ Projection
  pipeline.push({
    $project: {
      firstName: 1,
      lastName: 1,
      username: 1,
      username: 1,
      phoneNumber: 1,
      profileIcon: 1,
    },
  });

  pipeline.push({ $sort: { createdAt: -1 } });

  // 6️⃣ Pagination
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }]),
      ],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await User.aggregate(pipeline);
  console.log("result", result);
  return {
    users: result[0]?.data || [],
    meta: generateMeta(
      page,
      limit,
      result[0]?.totalFiltered[0]?.count || 0
    ),
  };
};

const createFriendRequest = async (data) => {
  try {
    const { userId, friendUserId, notes } = data;

    if (String(userId) === String(friendUserId)) {
      throw new Error("Cannot send friend request to yourself");
    }
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
const getFriendRequests = async ({ page = 1, limit = 10, userId, status }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

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
const updateFriendRequests = async ({ id, status, userId }) => {

  const friendRequest = await FriendRequest.findById(id);


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


    if (!friendRequest) {

      return { error: "friend_request_not_found" };
    }

    if (
      friendRequest.sender.id.toString() !== userId.toString() &&
      friendRequest.receiver.id.toString() !== userId.toString()
    ) {

      return { error: "user_not_involved" };
    }





    // Delete the friend request entry from the database
    const result = await FriendRequest.deleteOne({ _id: id });


    if (result.deletedCount === 0) {

      return { error: "friend_request_not_found" };
    }


    return { message: "Friend request deleted successfully" };
  } catch (error) {

    return { error: "Error deleting friend request" };
  }
};
const getSentFriendRequests = async ({ page, limit, userId, status }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const me = new mongoose.Types.ObjectId(userId);

  const pipeline = [
    {
      $match: {
        "sender.id": me,
        "sender.status": status
      }
    },

    {
      $lookup: {
        from: "users",
        let: { receiverId: "$receiver.id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$receiverId"] }
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
        as: "receiverDetails"
      }
    },

    { $unwind: "$receiverDetails" },

    {
      $project: {
        _id: 1, // friend request ID
        firstName: "$receiverDetails.firstName",
        lastName: "$receiverDetails.lastName",
        phoneNumber: "$receiverDetails.phoneNumber",
        profileIcon: "$receiverDetails.profileIcon"
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
const seeFriends = async ({ page, limit, userId, status }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const me = new mongoose.Types.ObjectId(userId);

  const pipeline = [
    {
      $match: {
        $and: [
          {
            $or: [
              { "sender.id": me },
              { "receiver.id": me }
            ]
          },
          { "sender.status": "accept" },
          { "receiver.status": "accept" }
        ]
      }
    },


    {
      $lookup: {
        from: "users",
       let: { otherId: { $cond: { if: { $eq: ["$sender.id", me] }, then: "$receiver.id", else: "$sender.id" } } }, 
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$_id", "$$otherId"] }
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
        as: "receiverDetails"
      }
    },

    { $unwind: "$receiverDetails" },

    {
      $project: {
        _id: 1, // friend request ID
        firstName: "$receiverDetails.firstName",
        lastName: "$receiverDetails.lastName",
        phoneNumber: "$receiverDetails.phoneNumber",
        profileIcon: "$receiverDetails.profileIcon"
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
  const [result, friendrtequests] = await Promise.all([
    FriendRequest.aggregate(pipeline),
    getFriendRequests({ page, limit, userId, status: "pending" })
  ]);
  const requests = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  return {
    requests,
    meta: {
      page,
      limit,
      totalRecords: totalFiltered,
      totalPages: limit === 0 ? 1 : Math.ceil(totalFiltered / limit),
      friendRequests: friendrtequests.meta.totalRecords
    }
  };
};
module.exports = {
  getFriends,
  createFriendRequest,
  getFriendRequests,
  getFriendRequestById,
  updateFriendRequests,
  unfriend,
  getSentFriendRequests,
  seeFriends
};
