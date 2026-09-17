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
    titleKey: "menu_order_confirmed_title",
    bodyKey: "menu_order_confirmed_body",
    bodyValues: (order) => ({ orderNumber: order.orderNumber }),
  },

  MENU_ORDER_CANCELLED: {
    type: NotificationTypes.MENU_ORDER_CANCELLED,
    titleKey: "menu_order_cancelled_title",
    bodyKey: "menu_order_cancelled_body",
    bodyValues: (order) => ({ orderNumber: order.orderNumber }),
  },

  MENU_ORDER_SENT: {
    type: NotificationTypes.MENU_ORDER_SENT,
    titleKey: "menu_order_sent_title",
    bodyKey: "menu_order_sent_body",
    bodyValues: (order) => ({ orderNumber: order.orderNumber }),
  },

  MENU_ORDER_COMPLETED: {
    type: NotificationTypes.MENU_ORDER_COMPLETED,
    titleKey: "menu_order_completed_title",
    bodyKey: "menu_order_completed_body",
    bodyValues: (order) => ({ orderNumber: order.orderNumber }),
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

    sendUserNotifications({
      recipientIds: userIds,
      titleKey: config.titleKey,
      bodyKey: config.bodyKey,
      bodyValues: config.bodyValues ? config.bodyValues(order) : {},
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
