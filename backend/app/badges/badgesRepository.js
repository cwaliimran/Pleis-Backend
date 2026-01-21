const { User } = require('@UserModel');
const { buildKeywordQueryFromModels } = require('@utils/dbUtils/queryUtil');
const { generateMeta } = require('@utils/responseUtil');
// const  Badges  = require('@BadgesModel');
const mongoose = require("mongoose");
const { escapeRegex } = require("./formater/helper");
const BadgeCategoriesModel = require("@BadgeCategoriesModel");
const UserBadges = require("@UserBadgesModel");
const { getFullImageUrl } = require('@utils/imageHelper');
const { sendUserNotifications } = require('@notificationsUtil');
const { NotificationTypes } = require('@NotificationsModel');

const addUserBadges = async (data) => {
  try {
    const existingBadge = await UserBadges.findOne({
      user: data.userId,
      badgeCategory: data.badageId
    });

    if (existingBadge) {
      return existingBadge;
    }
    const userBadge = await UserBadges.create({
      user: data.userId,
      badgeCategory: data.badageId
    });
    await sendUserNotifications({
      recipientIds: [data.userId.toString()],
      title: "Badge Earned!",
      body: `Congratulations! You've earned a new badge.`,
      data: {
        type: NotificationTypes.BADAGE_EARNED,
        objectType: "group",
      },
      image: "noimage",
      sender: data.userId,
      objectId: data.badageId,
    });
    return userBadge;
  } catch (err) {
    throw err;
  }
};

const getBadgess = async ({ page = 1, limit = 10, keyword, status, userId }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  /* ===================== 1️⃣ STREAK (HARDCODED) ===================== */
  const streak = {
    count: 7
  };

  /* ===================== 2️⃣ USER BADGES (PIPELINE + LOOKUP) ===================== */
  const userBadges = await UserBadges.aggregate([
    {
      $match: {
        user: new mongoose.Types.ObjectId(userId)
      }
    },
    {
      $lookup: {
        from: "badgecategories",
        localField: "badgeCategory",
        foreignField: "_id",
        pipeline: [
          {
            $project: {
              title: 1,
              description: 1,
              icon: 1,
              category: 1,
              condition: 1,
              points: 1,
              status: 1
            }
          }
        ],
        as: "badge"
      }
    },
    { $unwind: "$badge" },

    ...(status
      ? [{ $match: { "badge.status": status } }]
      : []),

    ...(keyword
      ? [{
        $match: {
          "badge.title": { $regex: keyword, $options: "i" }
        }
      }]
      : []),
    { $sort: { earnedAt: -1 } }
  ]);

  /* ===================== 3️⃣ ALL BADGES (SIMPLE FETCH) ===================== */
  const badgeFilter = {
    ...(status && { status }),
    ...(keyword && {
      title: { $regex: keyword, $options: "i" }
    })
  };

  const [allBadges, totalRecords] = await Promise.all([
    BadgeCategoriesModel.find(
      badgeFilter,
      {
        _id: 1,
        title: 1,
        description: 1,
        icon: 1,
        category: 1,
        condition: 1,
        points: 1,
        status: 1,
        createdAt: 1
      }
    )
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit === 0 ? 0 : limit),

    BadgeCategoriesModel.countDocuments(badgeFilter)
  ]);

  const data = {
    streak,
    userBadges,
    allBadges,
  }

  /* ===================== FINAL RESPONSE ===================== */
  return {
    badges: data,
    meta: {
      page,
      limit,
      totalRecords,
      totalPages: limit === 0 ? 1 : Math.ceil(totalRecords / limit)
    }
  };
};

const detailBadgess = async (id) => {
  if (!id) return null;

  const badge = await BadgeCategoriesModel.findOne({ _id: new mongoose.Types.ObjectId(id) },).lean();
  if (!badge) return null;

  badge.icon = badge.icon
    ? getFullImageUrl(badge.icon)
    : getFullImageUrl("noimage.png");

  return badge;
};


module.exports = {
  addUserBadges,
  getBadgess,
  detailBadgess
};
