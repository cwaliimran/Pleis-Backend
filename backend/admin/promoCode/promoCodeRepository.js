
const {PromoCode }= require("@PromoCodeModel"); 
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");

const createPromoCode = async (data) => {
  try {
    const promoCode = new PromoCode(data);
    await promoCode.save();
    return promoCode;
  } catch (err) {
    throw err;
  }
};



const getPromoCodes = async ({ timezone,page, limit, keyword, status, userId, date, range,today,skip }) => {

  const pipeline = [
  {
    $match: {
      ...(userId && { companyOrganizer: new mongoose.Types.ObjectId(userId) }),
    
    }
  }
];
if (range == "monthly") {
  const { start, end } = getStartAndEndOfMonth(today, timezone);

  pipeline.push({
    $match: {
      createdAt: { $gte: start, $lt: end }
    }
  });
}
if (range == "weekly") {
  const { start, end } = getStartAndEndOfWeek(today, timezone);

  pipeline.push({
    $match: {
      createdAt: { $gte: start, $lt: end }
    }
  });
}
if (range == "today") {
    const start = new Date(today);
    const end = new Date(new Date(today).setDate(start.getDate() + 1));

  pipeline.push({
    $match: {
      createdAt: { $gte: start, $lt: end }
    }
  });
}
  // Apply filters
  if (status) {
    pipeline.push({ $match: { status } });
  } else {
    pipeline.push({ $match: { status: { $ne: "deleted" } } });
  }

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({
      $match: {
        createdAt: { $gte: start, $lt: end }
      }
    });
  }

if (keyword) {
  const keywordMatch = buildKeywordQueryFromModels(
    [
      { schema: PromoCode.PromoCode.schema }
    ],
    keyword
  );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }
}

  pipeline.push({ $sort: { createdAt: -1 } });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  const result = await PromoCode.aggregate(pipeline);

  let promoCodes = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    PromoCode.countDocuments({ ...(userId && { userId: userId }), status: { $ne: "deleted" } }),
    PromoCode.countDocuments({ status: "active", ...(userId && { userId: userId }) }),
    PromoCode.countDocuments({ status: "inactive", ...(userId && { userId: userId }) })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.promoCodesCount = { total, active, inactive };


//   reservations = reservations.map(item => {
//     const formatted = reservationsFormatter(item);
//     if (formatted.conditionType == "noCondition"||formatted.conditionType=="ticketRequirement"||formatted.conditionType=="customText"||formatted.conditionType=="ticketRequirement") {
//       delete formatted.amount;
//       if(formatted.conditionType == "noCondition")
//       {
//       delete formatted.ticketType;
//       }
//     }
//     else{
//             delete formatted.ticketType;
//     }
//     return formatted;
//   });
  return {promoCodes , meta}
}

const findPromoCodeById = async (id) => {
  return PromoCode.findById(id);
};

const findByIdAndUpdate = async (id, data) => {
  return PromoCode.findByIdAndUpdate(id, data, { new: true });
};
module.exports = {
  createPromoCode,
  getPromoCodes,
  findPromoCodeById,
  findByIdAndUpdate,

};