const orderRepo = require("./orderRepository");
const menuItemRepo = require("../menuItems/menuItemsRepository");
const mongoose = require("mongoose");
const { menuItemOrderFormatter } = require("./formatter/menuItemOrderFormatter");
const { generateMeta } = require("../../../helperUtils/responseUtil");
const { calculatePointsRepo } = require("../../loyalty/calculatePointsEarning/pointsEarningsRepository");
const { getOrgCompanyOrganizer } = require("../../organizationProfile/organizationProfileRepository");
const { createTransaction } = require("../../userWalletService/transactions/services/unifiedTransactionsService");


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

  //create transaction if payment method is applePay/card
  if (paymentMethod === "applePay" || paymentMethod === "card") {
    //TODO process payment here
    //update payment status
    order.paymentStatus = "paid";
    // await order.save();

    //add point to user wallet
    //get company organizer from organization
    const companyOrganizer = await getOrgCompanyOrganizer(organizationId);
    //calculate points based on totalPrice
    let pointsCalculation = await calculatePointsRepo(userId, companyOrganizer, totalPrice);

    let globalPoints = {
      base: pointsCalculation.global.earnedPoints,
      multiplier: 1,
      total: pointsCalculation.global.earnedPoints,
      pointsPerEuro: pointsCalculation.global.pointsPerEuro,
    };
    let companyPoints = {
      base: pointsCalculation.organizer.earnedPoints,
      multiplier: 1,
      total: pointsCalculation.organizer.earnedPoints,
      pointsPerEuro: pointsCalculation.organizer.pointsPerEuro,
    };

    //log the transaction for both loyalty/global wallet
    let data = {
      user: userId,
      companyOrganizer,
      organization: organizationId,
      companyPoints,
      globalPoints,
      allowNegative: false,
      type: "earn",
      description: "",
      entityId: order._id,
      domainType: "menuorders"
    }
    let trx = await createTransaction(data)
  }

  let formattedOrder = menuItemOrderFormatter(order, timezone);



  return { order: formattedOrder };
};

const addMoreItemsToOrder = async ({ orderId, items }) => {
  if (!items || !items.length) throw new Error("No items to add");

  // Fetch the existing order
  let order = await orderRepo.getOrderById(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status === "cancelled") throw new Error("Cannot add items to a cancelled order");
  // if paymentMethod is not payLater, cannot add more items
  if (order.paymentMethod !== "payLater") throw new Error("Cannot add items to this order");

  // Fetch all menu items being added
  const itemIds = items.map(i => new mongoose.Types.ObjectId(i.menuItem));
  const menuItems = await menuItemRepo.getMenuItemsWithFilters({ _id: { $in: itemIds } });

  if (!menuItems.length) throw new Error("Invalid items to add");

  let additionalTotalPrice = 0;

  // Prepare new order items with snapshot inside the item object
  const newOrderItems = items.map(i => {
    const menuItem = menuItems.find(m => m._id.toString() === i.menuItem);
    if (!menuItem) throw new Error(`Invalid menu item: ${i.menuItem}`);

    const price = menuItem.discountPrice || menuItem.basePrice;
    const finalPrice = price * i.quantity;
    additionalTotalPrice += finalPrice;

    return {
      menuItem: menuItem._id,
      quantity: i.quantity,
      finalPrice,
      menuItemSnapShot: JSON.parse(JSON.stringify(menuItem)), // snapshot inside item
    };
  });

  // Update order with new items and total price
  order.items = order.items.concat(newOrderItems);
  order.totalPrice += additionalTotalPrice;

  // Save updated order
  let updatedOrder = await order.save();
  let formattedOrder = menuItemOrderFormatter(updatedOrder);

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
  addMoreItemsToOrder
};
