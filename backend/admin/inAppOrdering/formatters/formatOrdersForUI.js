/* ================= HELPERS ================= */

const normalizePickupType = (value = "") =>
  value.toLowerCase().replace(/\s+/g, "");

const matchPickupType = (order, pickupFilter) => {
  if (!pickupFilter) return true;

  // ✅ preorder acts as a virtual pickup filter
  if (pickupFilter.toLowerCase() === "preorder") {
    return isPreorderOrderppickup(order);
  }

  return (
    normalizePickupType(order.pickupType) ===
    normalizePickupType(pickupFilter)
  );
};

const hasUndeliveredItem = (order) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const combos = Array.isArray(order.combos) ? order.combos : [];
  return (
    items.some((item) => item.isdelivered === false) ||
    combos.some((combo) =>
      (combo.items || []).some((item) => item.isdelivered === false),
    )
  );
};

const allItemsDelivered = (order) => {
  const items = Array.isArray(order.items) ? order.items : [];
  const combos = Array.isArray(order.combos) ? order.combos : [];
  if (!items.length && !combos.length) return false;
  const itemsOk =
    !items.length || items.every((item) => item.isdelivered === true);
  const combosOk =
    !combos.length ||
    combos.every(
      (combo) =>
        Array.isArray(combo.items) &&
        combo.items.length > 0 &&
        combo.items.every((item) => item.isdelivered === true),
    );
  return itemsOk && combosOk;
};

const isPaid = (order) => order.paymentStatus === "paid";

/* ================= CLASSIFIERS ================= */

const isPastOrder = (order) => {
  if (order.status === "cancelled") return true;

  return (
    order.status === "completed" &&
    allItemsDelivered(order) &&
    isPaid(order)
  );
};

const isActiveOrder = (order) => {
  if (["pending", "confirmed", "sent"].includes(order.status)) {
    return true;
  }

  return (
    order.status === "completed" &&
    (!allItemsDelivered(order) || !isPaid(order))
  );
};

const isPreorderOrder = (order) =>
  order.orderType === "preorder" &&
  order.status === "preorder";
const isPreorderOrderppickup = (order) =>
  order.orderType === "preorder" &&
  order.status === "pending";

/* ================= COUNTS ================= */

const countOrders = (orders) => {
  let activeOrdersCount = 0;
  let preordersCount = 0;
  let pastOrdersCount = 0;

  let activeDetails = {
    new: 0,
    inProgress: 0,
    completed: 0,
  };

  orders.forEach(order => {
    // ✅ PREORDERS (only active pending preorders)
    if (isPreorderOrder(order)) {
      preordersCount++;
      return;
    }

    if (isPastOrder(order)) {
      pastOrdersCount++;
      return;
    }

    if (isActiveOrder(order)) {
      activeOrdersCount++;

      if (order.status === "pending") activeDetails.new++;
      if (["confirmed", "sent"].includes(order.status)) {
        activeDetails.inProgress++;
      }
      if (
        order.status === "completed" &&
        (!allItemsDelivered(order) || !isPaid(order))
      ) {
        activeDetails.completed++;
      }
    }
  });

  return {
    activeOrdersCount,
    preordersCount,
    pastOrdersCount,
    activeDetails,
  };
};

/* ================= FILTER ================= */

const filterOrders = ({
  orders,
  orderStatus = "",
  activeorderStatus = "",
  pickupFilter = "",
}) => {
  const status = orderStatus.toLowerCase().trim();
  const activeSub = activeorderStatus.toLowerCase().trim();
  const pickup = pickupFilter.trim();
  return orders.filter(order => {
    // 🚫 Cancelled orders ONLY appear in past
    if (order.status === "cancelled") {
      return ["postorder", "postorders", "past"].includes(status);
    }

    /* ========= ACTIVE ========= */
    if (!status || status === "active") {
      if (!activeSub) return isActiveOrder(order);

      // 🆕 ACTIVE → NEW + PICKUP FILTER
      if (activeSub === "new") {
        return (
          order.status === "pending" &&
          matchPickupType(order, pickup)
        );
      }
      if (activeSub === "inprogress") {
        return (
          (!allItemsDelivered(order) && ["confirmed", "sent"].includes(order.status))
        );
      }

      if (activeSub === "completed") {

        return (

          order.status === "completed" &&
          (allItemsDelivered(order) || !isPaid(order))
        );
      }

      return isActiveOrder(order);
    }

    /* ========= PREORDERS ========= */
    if (["preorder", "preorders"].includes(status)) {
      return isPreorderOrder(order);
    }

    /* ========= PAST ========= */
    if (["postorder", "postorders", "past"].includes(status)) {
      return isPastOrder(order);
    }

    return false;
  });
};

/* ================= EXPORT ================= */

const formatOrdersForUI = (
  orders = [],

) => {
  const counts = countOrders(orders);

  // Calculate skip (pagination offset)
  const skip = (page - 1) * limit;

  // Filter orders
  const filteredOrders = filterOrders({
    orders,
    orderStatus,
    activeorderStatus,
    pickupFilter,
  });


  return {
    activeOrdersCount: counts.activeOrdersCount,
    preordersCount: counts.preordersCount,
    pastOrdersCount: counts.pastOrdersCount,
    activeDetails: counts.activeDetails,
  };
};

module.exports = {
  formatOrdersForUI,
};
