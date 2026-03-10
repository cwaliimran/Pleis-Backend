const Orders = require("@OrdersModel");
const { getModelCounts } = require("../../../helperUtils/dbUtils/queryUtil");
const mongoose = require("mongoose");

const createOrder = async (orderData, session = null) => {
  return Orders.create([orderData], { session }).then(res => res[0]);
};


const getOrderById = async (id) => {
  const orderId = new mongoose.Types.ObjectId(id);

  const result = await Orders.aggregate([
    // 1️⃣ Match order
    {
      $match: { _id: orderId },
    },

    // 2️⃣ Lookup transactions
    {
      $lookup: {
        from: "unifiedwallettransactions",
        let: { orderId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ["$entityId", "$$orderId"] },
            },
          },
          {
            $project: {
              walletType: 1,
              points: "$points.total",
            },
          },
        ],
        as: "transactions",
      },
    },

    // 3️⃣ Convert transactions array → object
    {
      $addFields: {
        transactions: {
          $arrayToObject: {
            $map: {
              input: "$transactions",
              as: "tx",
              in: {
                k: "$$tx.walletType",
                v: {
                  points: "$$tx.points",
                },
              },
            },
          },
        },
      },
    },

    // 4️⃣ Populate organization
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        as: "organization",
        pipeline: [
          {
            $project: {
              "basicInfo.name": 1,
              "basicInfo.media.logo": 1,
              location: 1,
            },
          },
        ],
      },
    },

    // 5️⃣ Flatten organization
    {
      $unwind: {
        path: "$organization",
        preserveNullAndEmptyArrays: true,
      },
    },
  ]);

  return result[0] || null;
};



const getOrdersByUser = async (userId, page, limit, query = {}) => {
  query.status = { $ne: "pendingPayment" }; // Exclude pendingPayment orders
  return Orders.find({ user: userId, ...query }).select("orderNumber createdAt status paymentMethod paymentStatus").populate("organization", "basicInfo.name basicInfo.media.logo")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

const getCounts = async (query) => {
  query.status = { $ne: "pendingPayment" }; // Exclude pendingPayment orders
  let counts = getModelCounts({
    model: Orders,
    filterQuery: query,
    statusMap: {
      status: ["pending", "confirmed", "completed", "cancelled"]
    }
  });
  return counts;
};

const updateOrderStatus = async (orderId, status) => {
  return Orders.findByIdAndUpdate(orderId, { status }, { new: true });
};

const addItemsToOrder = async (orderId, newItems, additionalTotalPrice) => {
  return Orders.findByIdAndUpdate(
    orderId,
    {
      $push: { items: { $each: newItems } },
      $inc: { totalPrice: additionalTotalPrice }
    },
    { new: true }
  );
};

const deleteOrder = async (orderId) => {
  return Orders.findByIdAndDelete(orderId);
};
const getTotalOrderPriceByUser = async (userId) => {
  try {
    // Find all orders for the given user
    const orders = await Orders.find({ user: userId })
      .select("items totalPrice")  // Only select the items and totalPrice fields
      .lean();  // Use lean() to return plain JavaScript objects instead of Mongoose documents

    if (orders.length === 0) return 0;

    // Sum the finalPrice of all items in each order
    let totalAmount = 0;
    orders.forEach(order => {
      // Sum finalPrice of all items in the current order
      const itemsTotal = order.items.reduce((sum, item) => sum + item.finalPrice, 0);
      totalAmount += itemsTotal;
    });

    return totalAmount;
  } catch (error) {

    throw error;
  }
};
module.exports = {
  createOrder,
  getOrderById,
  getOrdersByUser,
  updateOrderStatus,
  addItemsToOrder,
  deleteOrder,
  getCounts,
  getTotalOrderPriceByUser
};
