const orderRepo = require("./orderRepository");
const menuItemRepo = require("../menuItems/menuItemsRepository");
const mongoose = require("mongoose");
const { menuItemOrderFormatter } = require("./formatter/menuItemOrderFormatter");
const { generateMeta } = require("../../../helperUtils/responseUtil");
const { sendUserNotifications } = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const Organizations = require("@OrganizationModel");

const getStaffIdsByOrganization = async (organizationId) => {
  if (!mongoose.Types.ObjectId.isValid(organizationId)) {
    throw new Error("Invalid organization ID");
  }

  const organization = await Organizations.findById(
    organizationId,
    { staff: 1 }
  ).lean();

  if (!organization || !organization.staff) {
    return [];
  }

  // Extract staff user IDs
  const staffIds = organization.staff
    .map(item => item.user)
    .filter(Boolean)
    .map(id => id.toString());

  return staffIds;
};
// 1️⃣ Place an order

const placeOrder = async ({
  userId,
  timezone,
  items,
  notes,
  paymentMethod,
  pickupType,
  tableNumber,
}) => {
  if (!items || !items.length) throw new Error("Cart is empty");

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1️⃣ Fetch menu items
    const itemIds = items.map(i => new mongoose.Types.ObjectId(i.menuItem));
    const menuItems = await menuItemRepo
      .getMenuItemsWithFilters({ _id: { $in: itemIds } });

    if (!menuItems.length) throw new Error("Invalid items in cart");

    // Determine organization
    const organizationId =
      await menuItemRepo.getOrganizationIdByMenuItemId(menuItems[0].menu);

    let totalPrice = 0;

    // 2️⃣ Prepare order items w/snapshot
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
        menuItemSnapShot: JSON.parse(JSON.stringify(menuItem)),
      };
    });


    // 3️⃣ Create order document inside session
    let orderData = {
      user: userId,
      organization: organizationId,
      items: orderItems,
      totalPrice,
      notes,
      paymentMethod,
      pickupType,
      tableNumber,
      orderType: "online",
    };

    let orderStatus = "pending";
    if (paymentMethod === "applePay" || paymentMethod === "card") {
      orderStatus = "pendingPayment";
      orderData.lockUntil = new Date(Date.now() + 10 * 60 * 1000);
    }
    orderData.status = orderStatus;
    let order = await orderRepo.createOrder(orderData, session);

    // 5️⃣ Commit atomic transaction
    await session.commitTransaction();
    session.endSession();

    const formattedOrder = menuItemOrderFormatter(order, timezone);
    const staffIds = await getStaffIdsByOrganization(organizationId);
    console.log("organizationId",organizationId );
    console.log("staff ", staffIds);

    await sendUserNotifications({
      recipientIds: [userId.toString()],
      title: "Order Placed Successfully",
      body: `Your Order Has been placed. The total amount is ${formattedOrder.totalPrice} EUR`,
      data: {
        type: NotificationTypes.ORDER_UPDATE,
        objectType: "group",
        organization_id: organizationId.toString(),
      },
      image: (order.items[0].menuItemSnapShot.image) || "noimage",
      sender: userId,
      objectId: formattedOrder._id,
    });
        await sendUserNotifications({
      recipientIds: staffIds,
      title: "New Order Placed",
      body: `New Order Has been placed : ${formattedOrder._id} and is now being ${formattedOrder.status}. The total amount is ${formattedOrder.totalPrice} EUR`,
      data: {
        type: NotificationTypes.ORDER_UPDATE,
        objectType: "group",
        organization_id: organizationId.toString(),
      },
      image: (order.items[0].menuItemSnapShot.image) || "noimage",
      sender: userId,
      objectId: formattedOrder._id,
    });



    return { order: formattedOrder };

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

const placePreOrderMenuItemsWithReservation = async ({
  userId,
  timezone,
  items,
  notes,
  reservation,
  paymentMethod,
  session
}) => {

  if (!items || !items.length) throw new Error("Cart is empty");

  // 1️⃣ Fetch menu items
  const itemIds = items.map(i => new mongoose.Types.ObjectId(i.menuItem));

  const menuItems = await menuItemRepo.getMenuItemsWithFilters(
    { _id: { $in: itemIds } }
  );

  if (!menuItems.length) throw new Error("Invalid items in cart");

  const organizationId =
    await menuItemRepo.getOrganizationIdByMenuItemId(menuItems[0].menu);

  let totalPrice = 0;

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
      menuItemSnapShot: JSON.parse(JSON.stringify(menuItem)),
    };
  });

  const orderData = {
    user: userId,
    organization: organizationId,
    items: orderItems,
    totalPrice,
    notes,
    paymentMethod,
    status: "pending",
    orderType: "preorder",
    reservation,
  };

  let order = await orderRepo.createOrder(orderData, session);

  return order;
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
  await sendUserNotifications({
    recipientIds: [userId.toString()],
    title: "Order Placed Successfully",
    body: `Your Order Has been placed : ${order._id} and is now being ${order.status} and will be ready soon. The total amount is ${order.totalPrice} EUR`,
    data: { type: NotificationTypes.ORDER_UPDATE, objectType: "group" },
    sender: userId,
    objectId: order._id,
  });


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
  addMoreItemsToOrder,
  placePreOrderMenuItemsWithReservation
};
