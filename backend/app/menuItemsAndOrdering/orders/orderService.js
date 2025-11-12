const orderRepo = require("./orderRepository");
const menuItemRepo = require("../menuItems/menuItemsRepository");
const mongoose = require("mongoose");
const { menuItemOrderFormatter } = require("./formatter/menuItemOrderFormatter");
const { generateMeta } = require("../../../helperUtils/responseUtil");

// 1️⃣ Place an order

const placeOrder = async ({ userId, timezone, items, notes, paymentMethod,
  pickupType,
  tableNumber, }) => {
  if (!items || !items.length) throw new Error("Cart is empty");

  // 1️⃣ Fetch all menu items being ordered
  const itemIds = items.map(i => new mongoose.Types.ObjectId(i.menuItem));
  const menuItems = await menuItemRepo.getMenuItemsWithFilters({ _id: { $in: itemIds } });

  if (!menuItems.length) throw new Error("Invalid items in cart");

  //find organization from first menu item
  const organizationId = await menuItemRepo.getOrganizationIdByMenuItemId(menuItems[0].menu);
  let totalPrice = 0;

  // 2️⃣ Prepare order items with snapshot inside the item object
  const orderItems = items.map(i => {
    const menuItem = menuItems.find(m => m._id.toString() === i.menuItem);
    if (!menuItem) throw new Error(`Invalid menu item: ${i.menuItem}`);

    const price = menuItem.discountPrice || menuItem.basePrice;
    const finalPrice = price * i.quantity;
    totalPrice += finalPrice;

    return {
      menuItem: menuItem._id,
      quantity: i.quantity,
      finalPrice,
      menuItemSnapShot: JSON.parse(JSON.stringify(menuItem)), // snapshot inside item
    };
  });

  // 3️⃣ Create order document
  const orderData = {
    user: userId,
    organization: organizationId,
    items: orderItems,
    totalPrice,
    notes,
    paymentMethod,
    status: "pending",
    pickupType,
    tableNumber,
  };

  // 4️⃣ Save to DB
  let order = await orderRepo.createOrder(orderData);
  let formattedOrder = menuItemOrderFormatter(order, timezone);

  return { order: formattedOrder };
};

// 2️⃣ Get order by ID
const getOrderDetails = async (orderId) => {
  let order = await orderRepo.getOrderById(orderId);
  if (!order) return null;
  let formattedOrder = menuItemOrderFormatter(order);
  return { order: formattedOrder };
};

// 3️⃣ Get all orders for user
const getUserOrders = async (userId, page, limit) => {
  let [orders, counts] = await Promise.all([orderRepo.getOrdersByUser(userId, page, limit),
    orderRepo.getCounts({ user: userId })]);
  let formattedOrders = orders.map(order => menuItemOrderFormatter(order));

  let { pending, confirmed, completed, cancelled, totalFiltered } = counts;
  let meta = generateMeta(page, limit, totalFiltered);
  meta.counts = { pending, confirmed, completed, cancelled };
  return { orders: formattedOrders, meta, };
};

// 4️⃣ Update order status (admin or automated)
const updateOrderStatus = async (orderId, status) => {
  let orderStatusUpdate = await orderRepo.updateOrderStatus(orderId, status);
  let formattedOrder = menuItemOrderFormatter(orderStatusUpdate);
  return { order: formattedOrder };
};

// 5️⃣ Cancel order
const cancelOrder = async (orderId) => {
  let order = await orderRepo.updateOrderStatus(orderId, "cancelled");
  let formattedOrder = menuItemOrderFormatter(order);
  return { order: formattedOrder };
};

module.exports = {
  placeOrder,
  getOrderDetails,
  getUserOrders,
  updateOrderStatus,
  cancelOrder,
};
