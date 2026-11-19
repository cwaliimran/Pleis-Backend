const {
  sendUserNotifications,
} = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const {
  getCheckedInStaffForOrganization,
} = require("../../../staff/organizations/organizationRepository");
const {
  staffNewOrderBodyKey,
  formatOrderAmount,
} = require("../../../commonModules/menuItemsAndOrders/orderNotificationCopy");

/**
 * "New Order Placed" push to the staff checked in at the venue, once the order
 * is on the board: cash/instant orders when placed, card/Apple Pay orders once
 * paid. Staff audience: only the staff app shows it, and tapping it opens the
 * order there (objectId = order id, organization_id = venue).
 */
const notifyStaffNewOrder = async ({ order, formattedOrder, sender = null }) => {
  const organizationId = order?.organization?._id || order?.organization;
  if (!organizationId) return;

  const staffIds = await getCheckedInStaffForOrganization(organizationId);
  if (!staffIds.length) return;

  sendUserNotifications({
    recipientIds: staffIds,
    titleKey: "new_order_placed_title",
    bodyKey: staffNewOrderBodyKey(order.status),
    bodyValues: {
      orderNumber: order.orderNumber || formattedOrder?.orderNumber || "",
      amount: formatOrderAmount(formattedOrder?.totalPrice ?? order.totalPrice),
    },
    data: {
      type: NotificationTypes.NEW_MENU_ITEMS_ORDER,
      objectType: "menuorders",
      organization_id: organizationId.toString(),
    },
    image:
      order.items?.[0]?.menuItemSnapShot?.image ||
      order.combos?.[0]?.items?.[0]?.menuItemSnapShot?.image ||
      "noimage",
    sender,
    objectId: formattedOrder?._id || order._id,
    audience: "staff",
  });
};

module.exports = { notifyStaffNewOrder };
