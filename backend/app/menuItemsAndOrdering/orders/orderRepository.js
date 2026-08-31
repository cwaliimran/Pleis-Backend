const Orders = require("@OrdersModel");
const mongoose = require("mongoose");

const createOrder = async (orderData, session = null) => {
  return Orders.create([orderData], { session }).then((res) => res[0]);
};

const updateOrder = async (query, updateData, session = null) => {
  return Orders.findOneAndUpdate(query, updateData, { new: true, session });
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
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user",
        pipeline: [
          {
            $project: {
              firstName: 1,
              lastName: 1,
              email: 1,
              profileIcon: 1,
            },
          },
        ],
      },
    },

    // 5️⃣ Flatten user
    {
      $unwind: {
        path: "$user",
        preserveNullAndEmptyArrays: true,
      },
    },
  ]);

  return result[0] || null;
};

const getOrdersByUser = async (userId, page, limit, query = {}) => {
  // query.status = { $ne: "pendingPayment" }; // Exclude pendingPayment orders
  return Orders.find({ user: userId, ...query })
    .select("orderNumber createdAt status paymentMethod paymentStatus priceBreakdown")
    .populate("deliveryOption", "title deliveryMethod")
    .populate("organization", "basicInfo.name basicInfo.media.logo")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

const getCounts = async (query) => {
  const match = { ...query };
  if (match.user && !(match.user instanceof mongoose.Types.ObjectId)) {
    match.user = new mongoose.Types.ObjectId(match.user);
  }

  const [totalFiltered, grouped] = await Promise.all([
    Orders.countDocuments(query),
    Orders.aggregate([
      { $match: match },
      { $group: { _id: "$status", count: { $sum: 1 } } },
    ]),
  ]);

  const byStatus = Object.fromEntries(
    (grouped || []).map((row) => [row._id, row.count]),
  );

  return {
    totalFiltered,
    pending: byStatus.pending || 0,
    confirmed: byStatus.confirmed || 0,
    completed: byStatus.completed || 0,
    cancelled: byStatus.cancelled || 0,
  };
};

const updateOrderStatus = async (orderId, status) => {
  return Orders.findByIdAndUpdate(orderId, { status }, { new: true });
};

const addItemsToOrder = async (orderId, newItems, additionalTotalPrice) => {
  return Orders.findByIdAndUpdate(
    orderId,
    {
      $push: { items: { $each: newItems } },
      $inc: { totalPrice: additionalTotalPrice },
    },
    { new: true },
  );
};

const updateOrderWithItems = async (
  orderId,
  { newItems, additionalFinalPrice, newItemsTotal, newSaleDiscount, newFinalTotal },
) => {
  return Orders.findByIdAndUpdate(
    orderId,
    {
      $push: { items: { $each: newItems } },
      $inc: { totalPrice: additionalFinalPrice },
      $set: {
        "priceBreakdown.itemsTotal": newItemsTotal,
        "priceBreakdown.saleDiscount": newSaleDiscount,
        "priceBreakdown.finalTotal": newFinalTotal,
      },
    },
    { new: true },
  );
};

const deleteOrder = async (orderId) => {
  return Orders.findByIdAndDelete(orderId);
};
const getTotalOrderPriceByUser = async (userId) => {
  try {
    // Find all orders for the given user
    const orders = await Orders.find({ user: userId })
      .select("items combos totalPrice") // items + combos for spend totals
      .lean(); // Use lean() to return plain JavaScript objects instead of Mongoose documents

    if (orders.length === 0) return 0;

    // Sum finalPrice of all items + combos in each order
    let totalAmount = 0;
    orders.forEach((order) => {
      const itemsTotal = (order.items || []).reduce(
        (sum, item) => sum + (item.finalPrice || 0),
        0,
      );
      const combosTotal = (order.combos || []).reduce(
        (sum, combo) => sum + (combo.finalPrice || 0),
        0,
      );
      totalAmount += itemsTotal + combosTotal;
    });

    return totalAmount;
  } catch (error) {
    throw error;
  }
};
module.exports = {
  createOrder,
  updateOrder,
  getOrderById,
  getOrdersByUser,
  updateOrderStatus,
  addItemsToOrder,
  deleteOrder,
  getCounts,
  getTotalOrderPriceByUser,
  updateOrderWithItems,
};
