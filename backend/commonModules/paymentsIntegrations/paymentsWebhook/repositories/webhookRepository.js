const WebhookEvent = require("./WebhookTransactionsEvent.model");
const mongoose = require("mongoose");

const saveIfNotProcessed = async (data) => {
  try {
    return await WebhookEvent.create(data);
  } catch (err) {
    if (err.code === 11000) return null; // already processed
    throw err;
  }
};


/* =========================================================
   🔎 KEYWORD MATCH BUILDER
========================================================= */


const buildKeywordMatch = (keyword) => {
  if (!keyword?.trim()) return null;

  const regex = new RegExp(keyword, "i");

  const orConditions = [

    /* =========================
       🔹 TRANSACTION FIELDS
    ========================== */
    { provider: regex },
    { orderType: regex },
    { paymentStatus: regex },
    { transactionId: regex },

    /* =========================
       🔹 USER FIELDS
    ========================== */
    { "user.firstName": regex },
    { "user.lastName": regex },
    { "user.email": regex },
    { "user.username": regex },

    /* =========================
       🔹 ORGANIZER FIELDS
    ========================== */
    { "companyOrganizer.firstName": regex },
    { "companyOrganizer.lastName": regex },
    { "companyOrganizer.username": regex },
    { "companyOrganizer.email": regex },
    { "companyOrganizer.companyDetails.loyaltySettings.title": regex },

    /* =========================
       🔹 ORGANIZATION FIELDS
    ========================== */
    { "organization.basicInfo.name": regex }
  ];

  /* =========================
     🔹 SAFE OBJECT ID SEARCH
  ========================== */
  if (mongoose.Types.ObjectId.isValid(keyword)) {
    orConditions.push({
      orderNumber: new mongoose.Types.ObjectId(keyword)
    });
  }

  return { $or: orConditions };
};

/* =========================================================
   📦 GET TRANSACTIONS (WITH FILTERS + PAGINATION)
========================================================= */

const getOrdersTransactions = async ({
  match = {},
  keyword,
  skip = 0,
  limit = 10
}) => {

  /* =====================================================
     🔵 CASE A — NO KEYWORD (FAST TWO-STAGE)
  ===================================================== */

  if (!keyword?.trim()) {

    const idPipeline = [];

    if (Object.keys(match).length) {
      idPipeline.push({ $match: match });
    }

    idPipeline.push(
      { $sort: { createdAt: -1, _id: -1 } },
      { $skip: skip }
    );

    if (limit > 0) idPipeline.push({ $limit: limit });

    idPipeline.push({ $project: { _id: 1 } });

    const ids = await WebhookEvent.aggregate(idPipeline);
    if (!ids.length) return [];

    const txIds = ids.map(i => i._id);

    const pipeline = [
      { $match: { _id: { $in: txIds } } },
      {
        $addFields: {
          __order: { $indexOfArray: [txIds, "$_id"] }
        }
      },

      // Organization lookup
      {
        $lookup: {
          from: "organizations",
          localField: "organization",
          foreignField: "_id",
          as: "organization"
        }
      },

      // User lookup (REQUIRED)
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user"
        }
      },

      {
        $addFields: {
          organization: { $arrayElemAt: ["$organization", 0] },
          user: { $arrayElemAt: ["$user", 0] }
        }
      },

      {
        $project: {
          provider: 1,
          orderType: 1,
          orderNumber: 1,
          paymentStatus: 1,
          transactionId: 1,
          amount: 1,
          payload: 1,
          createdAt: 1,
          updatedAt: 1,
          __order: 1,

          organization: {
            _id: "$organization._id",
            name: "$organization.basicInfo.name"
          },

          user: {
            _id: "$user._id",
            username: "$user.username",
            firstName: "$user.firstName",
            lastName: "$user.lastName",
            email: "$user.email"
          }
        }
      },

      { $sort: { __order: 1 } }
    ];

    return WebhookEvent.aggregate(pipeline, { allowDiskUse: true });
  }

  /* =====================================================
     🔎 CASE B — KEYWORD SEARCH (LOOKUP FIRST)
  ===================================================== */

  const regexMatch = buildKeywordMatch(keyword);
  const pipeline = [];

  if (Object.keys(match).length) {
    pipeline.push({ $match: match });
  }

  pipeline.push(
    // Organization
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        as: "organization"
      }
    },

    // CompanyOrganizer (SEARCH ONLY)
    {
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        as: "companyOrganizer"
      }
    },

    // User
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user"
      }
    },

    {
      $addFields: {
        organization: { $arrayElemAt: ["$organization", 0] },
        companyOrganizer: { $arrayElemAt: ["$companyOrganizer", 0] },
        user: { $arrayElemAt: ["$user", 0] }
      }
    },

    { $match: regexMatch },
    { $sort: { createdAt: -1, _id: -1 } },
    { $skip: skip }
  );

  if (limit > 0) pipeline.push({ $limit: limit });

  pipeline.push({
    $project: {
      provider: 1,
      orderType: 1,
      orderNumber: 1,
      paymentStatus: 1,
      transactionId: 1,
      createdAt: 1,
      updatedAt: 1,

      organization: {
        _id: "$organization._id",
        name: "$organization.basicInfo.name",
        logo: "$organization.basicInfo.media.logo"
      },

      // ❌ companyOrganizer NOT returned

      user: {
        _id: "$user._id",
        username: "$user.username",
        firstName: "$user.firstName",
        lastName: "$user.lastName",
        email: "$user.email"
      }
    }
  });

  return WebhookEvent.aggregate(pipeline, { allowDiskUse: true });
};

/* =========================================================
   📊 COUNT FUNCTION
========================================================= */

const countOrdersTransactions = async ({ match = {}, keyword }) => {

  if (!keyword?.trim()) {
    return WebhookEvent.countDocuments(match);
  }

  const regexMatch = buildKeywordMatch(keyword);
  const pipeline = [];

  if (Object.keys(match).length) {
    pipeline.push({ $match: match });
  }

  pipeline.push(
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        as: "organization"
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        as: "companyOrganizer"
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user"
      }
    },
    {
      $addFields: {
        organization: { $arrayElemAt: ["$organization", 0] },
        companyOrganizer: { $arrayElemAt: ["$companyOrganizer", 0] },
        user: { $arrayElemAt: ["$user", 0] }
      }
    },
    { $match: regexMatch },
    { $count: "total" }
  );

  const res = await WebhookEvent.aggregate(pipeline, { allowDiskUse: true });
  return res[0]?.total || 0;
};


module.exports = {
  saveIfNotProcessed,
  getOrdersTransactions,
  countOrdersTransactions
};