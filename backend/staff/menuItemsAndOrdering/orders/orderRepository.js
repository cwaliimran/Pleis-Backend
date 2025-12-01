const Orders = require("@OrdersModel");
const { getModelCounts } = require("../../../helperUtils/dbUtils/queryUtil");

const createOrder = async (orderData) => {
  const order = new Orders(orderData);
  return order.save();
};

const getOrderById = async (id) => {
  return Orders.findById(id).populate("organization", "basicInfo.name basicInfo.media.logo location");
};

const getOrdersByUser = async (userId, page, limit, query = {}) => {
  return Orders.find({ user: userId, ...query }).select("orderNumber createdAt status").populate("organization", "basicInfo.name basicInfo.media.logo")
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
};

const getCounts = async (query) => {
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

const deleteOrder = async (orderId) => {
  return Orders.findByIdAndDelete(orderId);
};

module.exports = {
  createOrder,
  getOrderById,
  getOrdersByUser,
  updateOrderStatus,
  deleteOrder,
  getCounts
};
