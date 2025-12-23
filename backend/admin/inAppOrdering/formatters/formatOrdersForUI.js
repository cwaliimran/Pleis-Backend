const formatOrdersForUI = (
  orders = [],
  orderStatus = "",
  activeorderStatus = "",
  pickupFilter = "" // 👈 NEW OPTIONAL FILTER
) => {
  let ordersCount = 0;
  let preordersCount = 0;
  let pastOrdersCount = 0;

  let activeNewCount = 0;
  let activeInProgressCount = 0;
  let activeCompletedCount = 0;

  const normalizedKeyword = orderStatus?.toLowerCase().trim();
  const normalizedActiveKeyword = activeorderStatus?.toLowerCase().trim();
  const normalizedPickupFilter = pickupFilter?.toLowerCase().trim();

  // 1️⃣ COUNT EVERYTHING (UNCHANGED)
  orders.forEach(order => {
    const hasUndeliveredItem =
      Array.isArray(order.items) &&
      order.items.some(item => item.isdelivered === false);

    const isPreorder = order.status === "preorder";
    const isNewActive = order.status === "pending";
    const isInProgress = ["confirmed", "sent"].includes(order.status);
    const isCompletedNotDelivered =
      order.status === "completed" && hasUndeliveredItem;

    const isActive =
      isNewActive || isInProgress || isCompletedNotDelivered;

    const isPast =
      order.status === "cancelled" ||
      (order.status === "completed" && !hasUndeliveredItem);

    if (isPreorder) preordersCount += 1;
    if (isPast) pastOrdersCount += 1;

    if (isActive) {
      ordersCount += 1;
      if (isNewActive) activeNewCount += 1;
      if (isInProgress) activeInProgressCount += 1;
      if (isCompletedNotDelivered) activeCompletedCount += 1;
    }
  });

  // 2️⃣ FILTER ORDERS
  const filteredOrders = orders.filter(order => {
    const hasUndeliveredItem =
      Array.isArray(order.items) &&
      order.items.some(item => item.isdelivered === false);

    const isPreorder = order.status === "preorder";
    const isNewActive = order.status === "pending";
    const isInProgress = ["confirmed", "sent"].includes(order.status);
    const isCompletedNotDelivered =
      order.status === "completed" && hasUndeliveredItem;

    const isActive =
      isNewActive || isInProgress || isCompletedNotDelivered;

    const isPast =
      order.status === "cancelled" ||
      (order.status === "completed" && !hasUndeliveredItem);

    /* ===============================
       🔹 ACTIVE TAB WITH SUB FILTERS
    =============================== */
    if (!normalizedKeyword || normalizedKeyword === "active") {
      if (!normalizedActiveKeyword) {
        return isActive;
      }

      if (normalizedActiveKeyword === "new") {
        // ✅ APPLY PICKUP FILTER ONLY HERE
        if (normalizedPickupFilter) {
          return (
            isNewActive &&
            order.pickupType === normalizedPickupFilter
          );
        }
        return isNewActive;
      }

      if (normalizedActiveKeyword === "inprogress") {
        return isInProgress;
      }

      if (normalizedActiveKeyword === "completed") {
        return isCompletedNotDelivered;
      }

      return isActive;
    }

    /* ===============================
       🔹 PREORDERS
    =============================== */
    if (["preorder", "preorders"].includes(normalizedKeyword)) {
      return isPreorder;
    }

    /* ===============================
       🔹 PAST / POST ORDERS
    =============================== */
    if (["postorder", "postorders", "past"].includes(normalizedKeyword)) {
      return isPast;
    }

    return isActive;
  });

  return {
    orders: filteredOrders,

    // ❗ DO NOT CHANGE THESE KEYS
    activeOrdersCount: ordersCount,
    preordersCount,
    pastOrdersCount,

    // ACTIVE DETAILS
    activeDetails:
      normalizedKeyword === "active" || !normalizedKeyword
        ? {
            new: activeNewCount,
            inProgress: activeInProgressCount,
            completed: activeCompletedCount
          }
        : undefined
  };
};

module.exports = {
  formatOrdersForUI
};
