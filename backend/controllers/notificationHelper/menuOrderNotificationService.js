const MenuOrders = require("@OrdersModel");
const { sendUserNotifications } = require("../communicationController");
const { NotificationTypes } = require("../../models/Notifications");

/**
 * =====================================================
 * MENU ORDER NOTIFICATION MAP
 * =====================================================
 */

const MENU_NOTIFICATION_MAP = {
  MENU_ORDER_CONFIRMED: {
    type: NotificationTypes.MENU_ORDER_CONFIRMED,
    title: () => `Order Confirmed`,
    body: (order) =>
      `Your order ${order.orderNumber} has been confirmed.`,
  },

  MENU_ORDER_CANCELLED: {
    type: NotificationTypes.MENU_ORDER_CANCELLED,
    title: () => `Order Cancelled`,
    body: (order) =>
      `Your order ${order.orderNumber} has been cancelled.`,
  },

  MENU_ORDER_SENT: {
    type: NotificationTypes.MENU_ORDER_SENT,
    title: () => `Order Sent`,
    body: (order) =>
      `Your order ${order.orderNumber} is on the way.`,
  },

  MENU_ORDER_COMPLETED: {
    type: NotificationTypes.MENU_ORDER_COMPLETED,
    title: () => `Order Completed`,
    body: (order) =>
      `Your order ${order.orderNumber} has been completed. Enjoy!`,
  },
};

/**
 * =====================================================
 * GENERIC MENU ORDER NOTIFICATION DISPATCHER
 * =====================================================
 */

const sendMenuOrderNotification = async ({
  orderId,
  action,
  userIds = [],
}) => {
  try {
    if (!orderId || !action) return;

    const config = MENU_NOTIFICATION_MAP[action];
    if (!config) {
      console.warn(`[MENU_NOTIFICATION] Unknown action: ${action}`);
      return;
    }

    const order = await MenuOrders.findById(orderId)
      .select("orderNumber organization user totalPrice status")
      .lean();

    if (!order) {
      console.warn(`[MENU_NOTIFICATION] Order not found: ${orderId}`);
      return;
    }

    // Default recipient = order owner
    if (!userIds.length && order.user) {
      userIds = [order.user];
    }

    if (!userIds.length) {
      console.warn(`[MENU_NOTIFICATION] No recipients for order ${orderId}`);
      return;
    }

    await sendUserNotifications({
      recipientIds: userIds,
      title: config.title(order),
      body: config.body(order),
      data: {
        type: config.type,
        orderId,
        objectType: "menuorders",
      },
      sender: order.organization,
      objectId: orderId,
      image: null, // You can extend later to include item image snapshot
    });

  } catch (err) {
    console.error("[MENU_NOTIFICATION] Failed:", err);
  }
};

module.exports = { sendMenuOrderNotification };
