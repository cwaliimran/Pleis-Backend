const Orders = require("@OrdersModel");

const createOrder = async (orderData) => {
  const order = new Orders(orderData);
  return order.save();
};

const getOrderById = async (id) => {
  return Orders.findById(id);
};

const getOrdersByUser = async (userId, query = {}) => {
  return Orders.find({ user: userId, ...query }).sort({ createdAt: -1 });
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
};
