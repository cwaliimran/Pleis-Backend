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

const getFriendRequests = async ({ page, limit, userId }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;
console.log("userID",userId );
  const me = new mongoose.Types.ObjectId(userId);


const pipeline = [
  {
    $match: {
      "receiver.id": me,
      "receiver.status": "pending"
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


module.exports = {
  getFriends,
  createFriendRequest,
  getFriendRequests
};
