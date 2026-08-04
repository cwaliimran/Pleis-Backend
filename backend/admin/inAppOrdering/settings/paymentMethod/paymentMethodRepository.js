const PaymentMethod = require("@PaymentMethodModel");
const { buildKeywordQueryFromModels } = require("@utils/dbUtils/queryUtil");
const { generateMeta } = require("@utils/responseUtil");
const mongoose = require("mongoose");

const { cache, invalidate } = require("@redisCache");
const ACTIVE_PaymentMethodS_CACHE_KEY = "PaymentMethod:active";

const getPaymentMethods = async ({ organization }) => {
  const paymentMethodData = await PaymentMethod.findOne({
    organization: new mongoose.Types.ObjectId(organization)
  }).lean();

  const PaymentMethodData = paymentMethodData || {};

  return PaymentMethodData;
};
const getPaymentMethodsSummary = async ({
  timezone,
  page,
  limit,
  user,
  skip,
}) => {
  const pipeline = [];
  pipeline.push({ $match: { status: "active" } });

  pipeline.push({ $sort: { createdAt: -1 } });

  pipeline.push({
    $project: {
      _id: 1,
      name: 1,
      code: 1,
    },
  });

  // Apply pagination + counts using $facet
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }],
    },
  });

  const result = await PaymentMethod.aggregate(pipeline);

  let PaymentMethods = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  // Additional counts for meta (active/inactive/total by userId as creator)
  const [total, active, inactive] = await Promise.all([
    PaymentMethod.countDocuments({
      ...(user && { user: user }),
      status: { $ne: "deleted" },
    }),
    PaymentMethod.countDocuments({
      status: "active",
      ...(user && { user: user }),
    }),
    PaymentMethod.countDocuments({
      status: "inactive",
      ...(user && { user: user }),
    }),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.PaymentMethodsCount = { total, active, inactive };

  return { PaymentMethods, meta };
};

const findPaymentMethodById = async (organization) => {
  return PaymentMethod.findOne({ organization: new mongoose.Types.ObjectId(organization) });
};

const findByIdAndUpdate = async (id, data) => {
  await invalidate(ACTIVE_PaymentMethodS_CACHE_KEY);
  return PaymentMethod.findByIdAndUpdate(id, data, { new: true });
};


const createPaymentMethod = async (data) => {
  const newPaymentMethod = new PaymentMethod(data);
  await newPaymentMethod.save();
  return newPaymentMethod;
};
module.exports = {
  getPaymentMethods,
  findPaymentMethodById,
  findByIdAndUpdate,
  getPaymentMethodsSummary,
  createPaymentMethod,
};
