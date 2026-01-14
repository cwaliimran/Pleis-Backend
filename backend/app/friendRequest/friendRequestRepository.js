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
  status,
  userId,
  date
}) => {
const allRequests = await mongoose.model("FriendRequest").find({}).lean();
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [];

  pipeline.push({
    $match: {
      _id: { $ne: new mongoose.Types.ObjectId(userId) }
    }
  });
if (keyword) {
  const safeKeyword = escapeRegex(keyword);

  pipeline.push({
    $match: {
      $or: [
        { firstName: { $regex: safeKeyword, $options: "i" } },
        { lastName: { $regex: safeKeyword, $options: "i" } },
        { username: { $regex: safeKeyword, $options: "i" } },
      ]
    }
  });
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
      { $sort: { createdAt: -1 } },  // <-- IMPORTANT
      { $limit: 1 },                 // <-- PICK LATEST REQUEST
      { $project: { sender: 1, receiver: 1, createdAt: 1 } }
    ],
    as: "friendRequest"
  }
});



pipeline.push({
  $addFields: {
    relationshipStatus: {
      $cond: {
        if: { $gt: [ { $size: "$friendRequest" }, 0 ] },   // has any friendRequest
        then: {
          $let: {
            vars: { req: { $arrayElemAt: ["$friendRequest", 0] } },
            in: {
              $cond: [
                { 
                  $eq: [ "$$req.sender.id", new mongoose.Types.ObjectId(userId) ] 
                }, 
                "$$req.sender.status",       // you sent → show sender.status
                "$$req.receiver.status"      // they sent → show receiver.status
              ]
            }
          }
        },
        else: "send"   // no record → user can send request
      }
    }
  }
});
  pipeline.push({
    $project: {
      firstName: 1,
      username: 1,
       status: 1,
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
