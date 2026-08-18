const orderRepo = require("./orderRepository");
const menuItemRepo = require("../menuItems/menuItemsRepository");
const mongoose = require("mongoose");
const {
  menuItemOrderFormatter,
} = require("./formatter/menuItemOrderFormatter");
const { generateMeta } = require("../../../helperUtils/responseUtil");
const {
  sendUserNotifications,
} = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const Organizations = require("@OrganizationModel");
const { emitOrderEvent } = require("@socketIo/orders/orderSocketEmitter");
const {
  findAppUserByIdWithProjectionService,
} = require("../../usersManagement/usersService");
const {
  getCheckedInStaffForOrganization,
} = require("../../../staff/organizations/organizationRepository");
const { usePromoCode } = require("../../promoCode/promoCodeRepository");
const {
  getOrgCompanyOrganizer,
} = require("../../organizationProfile/organizationProfileRepository");
const { calculateItemPrice } = require("./formatter/calculateItemPrice");
const {
  calculateComboPrice,
} = require("../menuItems/formatter/formatMenuItemsCombos");
const {
  getWallet,
} = require("../../../app/loyalty/clubMembers/clubMembersRepository");
const {
  getLatestUserReservations,
  validateReservationForOrder,
  consumeReservationVoucher,
} = require("../../../admin/reservation/reservationRepository");

const buildPricedMenuItemSnapshot = (menuItem) => {
  const priceInfo = calculateItemPrice(menuItem);
  return {
    menuItem: menuItem._id,
    unitPrice: priceInfo.originalPrice,
    unitFinalPrice: priceInfo.finalPrice,
    saleDiscountPerUnit: priceInfo.saleDiscount,
    menuItemSnapShot: JSON.parse(
      JSON.stringify({
        ...menuItem,
        originalPrice: priceInfo.originalPrice,
        salePrice: priceInfo.finalPrice,
        hasDiscount: priceInfo.saleDiscount > 0,
      }),
    ),
  };
};

const validateComboSelection = (cartCombo, combo) => {
  const requiredItemIds = (combo.menuItems || []).map((id) => id.toString());
  const selectedIds = (cartCombo.items || []).map((id) => id.toString());

  if (!requiredItemIds.length) {
    throw new Error(`Combo has no menu items: ${cartCombo.combo}`);
  }

  if (selectedIds.length !== requiredItemIds.length) {
    throw new Error(
      `Combo ${cartCombo.combo} requires exactly ${requiredItemIds.length} items`,
    );
  }

  const sortedRequired = [...requiredItemIds].sort();
  const sortedSelected = [...selectedIds].sort();

  if (sortedRequired.join() !== sortedSelected.join()) {
    throw new Error(`Invalid items for combo: ${cartCombo.combo}`);
  }

  const quantity = Number(cartCombo.quantity);
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new Error(`Invalid quantity for combo: ${cartCombo.combo}`);
  }

  return { selectedIds, quantity };
};

const buildOrderCombos = async ({
  combos = [],
  comboDocs = [],
  userId,
  timezone,
}) => {
  if (!combos.length)
    return { orderCombos: [], combosTotal: 0, combosSaleDiscount: 0 };

  const orderCombos = [];
  let combosTotal = 0;
  let combosSaleDiscount = 0;

  for (const cartCombo of combos) {
    const combo = comboDocs.find((c) => c._id.toString() === cartCombo.combo);
    if (!combo) throw new Error(`Invalid combo: ${cartCombo.combo}`);

    const { selectedIds, quantity } = validateComboSelection(cartCombo, combo);

    const selectedObjectIds = selectedIds.map(
      (id) => new mongoose.Types.ObjectId(id),
    );
    const comboMenuItems = await menuItemRepo.getMenuItemsWithFilters({
      query: { _id: { $in: selectedObjectIds } },
      userId,
      timezone,
    });

    if (comboMenuItems.length !== selectedIds.length) {
      throw new Error(`Invalid combo menu items for combo: ${cartCombo.combo}`);
    }

    const pricedItems = comboMenuItems.map((item) => {
      const priceInfo = calculateItemPrice(item);
      return {
        ...item,
        salePrice: priceInfo.finalPrice,
        basePrice: priceInfo.originalPrice,
      };
    });

    const comboPriceInfo = calculateComboPrice(
      combo.priceMode,
      combo.price,
      pricedItems,
    );

    const unitPrice = comboPriceInfo.originalPrice;
    const unitFinalPrice = comboPriceInfo.salePrice;
    const saleDiscountPerUnit = Math.max(unitPrice - unitFinalPrice, 0);
    const finalPrice = unitFinalPrice * quantity;

    combosTotal += unitPrice * quantity;
    combosSaleDiscount += saleDiscountPerUnit * quantity;

    const comboItems = selectedIds.map((id) => {
      const menuItem = comboMenuItems.find((m) => m._id.toString() === id);
      const priced = buildPricedMenuItemSnapshot(menuItem);
      return {
        menuItem: priced.menuItem,
        menuItemSnapShot: priced.menuItemSnapShot,
      };
    });

    orderCombos.push({
      combo: combo._id,
      quantity,
      items: comboItems,
      unitPrice,
      unitFinalPrice,
      saleDiscountPerUnit,
      finalPrice,
      comboSnapShot: JSON.parse(
        JSON.stringify({
          _id: combo._id,
          name: combo.name,
          description: combo.description || "",
          subCategory: combo.subCategory || null,
          priceMode: combo.priceMode,
          price: combo.price,
          status: combo.status,
          originalPrice: unitPrice,
          salePrice: unitFinalPrice,
          hasDiscount: comboPriceInfo.hasDiscount,
        }),
      ),
    });
  }

  return { orderCombos, combosTotal, combosSaleDiscount };
};

const getStaffIdsByOrganization = async (organizationId) => {
  if (!mongoose.Types.ObjectId.isValid(organizationId)) {
    throw new Error("Invalid organization ID");
  }

  const organization = await Organizations.findById(organizationId, {
    staff: 1,
  }).lean();

  if (!organization || !organization.staff) {
    return [];
  }

  // Extract staff user IDs
  const staffIds = organization.staff
    .map((item) => item.user)
    .filter(Boolean)
    .map((id) => id.toString());

  return staffIds;
};
// 1️⃣ Place an order
const placeOrder = async ({
  userId,
  timezone,
  items,
  combos,
  notes,
  paymentMethod,
  pickupType,
  tableNumber,
  promoCode,
  tip,
  reservationId,
}) => {
  const cartCombos = combos || [];

  if (!items.length && !cartCombos.length) {
    throw new Error("Cart is empty");
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    let menuItems = [];
    let organizationId;

    if (items?.length) {
      const itemIds = items.map((i) => new mongoose.Types.ObjectId(i.menuItem));
      menuItems = await menuItemRepo.getMenuItemsWithFilters({
        query: { _id: { $in: itemIds } },
        userId,
        timezone,
      });

      if (!menuItems.length) throw new Error("Invalid items in cart");

      organizationId = await menuItemRepo.getOrganizationIdByMenuItemId(
        menuItems[0].menu,
      );
    }

    let comboDocs = [];
    if (cartCombos.length) {
      const comboIds = cartCombos.map(
        (c) => new mongoose.Types.ObjectId(c.combo),
      );
      comboDocs = await menuItemRepo.getMenuItemsCombosWithFilters({
        query: { _id: { $in: comboIds } },
      });

      if (comboDocs.length !== cartCombos.length) {
        throw new Error("Invalid combos in cart");
      }

      const firstComboItemId = comboDocs[0].menuItems?.[0];
      if (!firstComboItemId) throw new Error("Invalid combos in cart");

      const comboOrgId =
        await menuItemRepo.getOrganizationIdFromMenuItem(firstComboItemId);

      if (!organizationId) {
        organizationId = comboOrgId;
      } else if (comboOrgId.toString() !== organizationId.toString()) {
        throw new Error(
          "Combos and items must belong to the same organization",
        );
      }
    }

    const companyOrganizer = await getOrgCompanyOrganizer(organizationId);

    const { orderCombos, combosTotal, combosSaleDiscount } =
      await buildOrderCombos({
        combos: cartCombos,
        comboDocs,
        userId,
        timezone,
      });

    // 2️⃣ Prepare order items w/snapshot
    let totalPrice = orderCombos.reduce(
      (sum, combo) => sum + combo.finalPrice,
      0,
    );
    let totalSaleDiscount = combosSaleDiscount;
    let itemsTotal = combosTotal;

    const orderItems = (items || []).map((i) => {
      const menuItem = menuItems.find((m) => m._id.toString() === i.menuItem);
      if (!menuItem) throw new Error(`Invalid menu item: ${i.menuItem}`);

      const priceInfo = calculateItemPrice(menuItem);

      const unitPrice = priceInfo.originalPrice;
      const unitFinalPrice = priceInfo.finalPrice;
      const saleDiscountPerUnit = priceInfo.saleDiscount;

      const finalPrice = unitFinalPrice * i.quantity;
      const saleDiscountTotal = saleDiscountPerUnit * i.quantity;

      itemsTotal += unitPrice * i.quantity;
      totalSaleDiscount += saleDiscountTotal;
      totalPrice += finalPrice;

      const status = menuItem.isRequiresOrderConfirmation
        ? "pending"
        : "confirmed";

      return {
        menuItem: menuItem._id,
        quantity: i.quantity,
        unitPrice,
        unitFinalPrice,
        saleDiscountPerUnit,
        finalPrice,
        status,
        menuItemSnapShot: JSON.parse(JSON.stringify(menuItem)),
      };
    });

    let promoResult = null;

    if (promoCode) {
      promoResult = await usePromoCode(
        {
          promoCode,
          userId,
          companyOrganizer,
          amount: totalPrice,
        },
        session,
      );

      if (promoResult.error) {
        throw new Error(promoResult.error);
      }

      totalPrice = promoResult.finalAmount;
    }
    let voucherAmount = 0;
    if (reservationId) {
      const reservation = await validateReservationForOrder({
        reservationId,
        userId,
        timezone,
        session,
      });

      if (!reservation) {
        throw new Error("Reservation not found or not valid for this user");
      }

      const voucherResult = await consumeReservationVoucher({
        reservation,
        orderAmount: totalPrice,
        session,
      });

      voucherAmount = voucherResult.voucherAmount;
      totalPrice = voucherResult.orderAmountDue;
      if (voucherAmount > 0) {
      }
    }

    // 3️⃣ Create order document inside session
    totalPrice += Number(tip || 0);
    let orderData = {
      user: userId,
      organization: organizationId,
      items: orderItems,
      combos: orderCombos,
      totalPrice,
      reservation: reservationId || null,
      priceBreakdown: {
        itemsTotal,
        saleDiscount: totalSaleDiscount,
        promoDiscount: promoCode ? promoResult.discount || 0 : 0,
        voucherDiscount: voucherAmount,
        tax: 0,
        finalTotal: totalPrice,
        promoCode: promoCode || null,
        tip: tip || 0,
      },
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

    let formattedOrder = menuItemOrderFormatter(order, timezone);
    //get user details
    let userDetails = await findAppUserByIdWithProjectionService(userId, {
      profileIcon: 1,
      firstName: 1,
      lastName: 1,
      profileIcon: 1,
      email: 1,
      username: 1,
    });
    formattedOrder.user = userDetails;

    // Emit socket event for new order (only for cash payments)
    if (paymentMethod === "cash") {
      emitOrderEvent({
        io: global.io,
        eventName: "NEW_ORDER",
        orderId: order._id,
        organizationId: order.organization,
        data: formattedOrder,
      });

      const staffIds = await getCheckedInStaffForOrganization(
        organizationId,
        timezone,
      );

      await session.commitTransaction();
      session.endSession();

      sendUserNotifications({
        recipientIds: staffIds,
        title: "New Order Placed",
        body: `New Order Has been placed : and is now being ${formattedOrder.status}. The total amount is ${formattedOrder.totalPrice} EUR`,
        data: {
          type: NotificationTypes.NEW_MENU_ITEMS_ORDER,
          objectType: "menuorders",
          organization_id: organizationId.toString(),
        },
        image:
          order.items[0]?.menuItemSnapShot?.image ||
          order.combos[0]?.items[0]?.menuItemSnapShot?.image ||
          "noimage",
        sender: userId,
        objectId: formattedOrder._id,
      });
    }

    //TODO if paymentMethod is card/applePay and paid then send notification to staff as well, or maybe check from service where monri is processing payment

    return { order: formattedOrder };
  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};

const updateOrder = async ({
  orderId,
  userId,
  timezone,
  items,
  combos,
  notes,
  paymentMethod,
  pickupType,
  tableNumber,
  promoCode,
  tip,
}) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // 1️⃣ Get existing order
    const existingOrder = await orderRepo.getOrderById(
      orderId,
      userId,
      session,
    );

    if (!existingOrder) {
      throw new Error("Order not found");
    }

    if (existingOrder.status !== "pending") {
      throw new Error("Only orders in pendingPayment state can be updated");
    }

    const organizationId =
      existingOrder.organization?._id || existingOrder.organization;

    // IMPORTANT:
    // undefined = don't update this field
    // [] = explicitly replace with empty array

    const shouldUpdateItems = items !== undefined;
    const shouldUpdateCombos = combos !== undefined;

    let orderItems = existingOrder.items || [];
    let orderCombos = existingOrder.combos || [];

    let itemsTotal = 0;
    let totalSaleDiscount = 0;
    let totalPrice = 0;

    // =========================================================
    // 2️⃣ UPDATE ITEMS ONLY IF PROVIDED
    // =========================================================
    let orderStatus = existingOrder.status;

    if (shouldUpdateItems) {
      if (!Array.isArray(items)) {
        throw new Error("Items must be an array");
      }

      if (items.length) {
        const itemIds = items.map(
          (item) => new mongoose.Types.ObjectId(item.menuItem),
        );

        const menuItems = await menuItemRepo.getMenuItemsWithFilters({
          query: {
            _id: { $in: itemIds },
          },
          userId,
          timezone,
        });

        if (menuItems.length !== items.length) {
          throw new Error("Invalid items in cart");
        }
        // Make sure all items belong to same organization
        const itemOrganizationId =
          await menuItemRepo.getOrganizationIdByMenuItemId(menuItems[0].menu);

        if (itemOrganizationId.toString() !== organizationId.toString()) {
          throw new Error(
            "Items must belong to the same organization as the order",
          );
        }

        orderItems = items.map((item) => {
          const menuItem = menuItems.find(
            (m) => m._id.toString() === item.menuItem.toString(),
          );

          if (!menuItem) {
            throw new Error(`Invalid menu item: ${item.menuItem}`);
          }

          if (!item.quantity || item.quantity <= 0) {
            throw new Error(`Invalid quantity for menu item: ${item.menuItem}`);
          }
          const priceInfo = calculateItemPrice(menuItem);

          const unitPrice = priceInfo.originalPrice;
          const unitFinalPrice = priceInfo.finalPrice;
          const saleDiscountPerUnit = priceInfo.saleDiscount;

          const finalPrice = unitFinalPrice * item.quantity;

          const saleDiscountTotal = saleDiscountPerUnit * item.quantity;

          itemsTotal += unitPrice * item.quantity;

          totalSaleDiscount += saleDiscountTotal;

          totalPrice += finalPrice;

          const status = menuItem.isRequiresOrderConfirmation
            ? "pending"
            : "confirmed";

          return {
            menuItem: menuItem._id,
            quantity: item.quantity,

            unitPrice,
            unitFinalPrice,
            saleDiscountPerUnit,
            finalPrice,

            status,

            menuItemSnapShot: JSON.parse(JSON.stringify(menuItem)),
          };
        });
      } else {
        // Explicit [] means remove all items
        orderItems = [];
      }

      // Recompute order-level status from the items we just built.
      // Only ever auto-update it if the order is currently "pending" —
      // any other existing status (e.g. "confirmed", "cancelled") is left untouched.
      if (orderStatus === "pending") {
        const hasItemNeedingConfirmation = orderItems.some(
          (item) => item.status === "pending",
        );
        orderStatus = hasItemNeedingConfirmation ? "pending" : "confirmed";
      }
    }

    // =========================================================
    // 3️⃣ UPDATE COMBOS ONLY IF PROVIDED
    // =========================================================

    if (shouldUpdateCombos) {
      if (!Array.isArray(combos)) {
        throw new Error("Combos must be an array");
      }

      if (combos.length) {
        const comboIds = combos.map(
          (combo) => new mongoose.Types.ObjectId(combo.combo),
        );

        const comboDocs = await menuItemRepo.getMenuItemsCombosWithFilters({
          query: {
            _id: { $in: comboIds },
          },
        });

        if (comboDocs.length !== combos.length) {
          throw new Error("Invalid combos in cart");
        }

        // Validate combo organization
        const firstComboItemId = comboDocs[0]?.menuItems?.[0];

        if (!firstComboItemId) {
          throw new Error("Invalid combos in cart");
        }

        const comboOrganizationId =
          await menuItemRepo.getOrganizationIdFromMenuItem(firstComboItemId);

        if (comboOrganizationId.toString() !== organizationId.toString()) {
          throw new Error(
            "Combos must belong to the same organization as the order",
          );
        }

        const companyOrganizer = await getOrgCompanyOrganizer(organizationId);

        const { orderCombos: newOrderCombos } = await buildOrderCombos({
          combos,
          comboDocs,
          userId,
          timezone,
        });

        orderCombos = newOrderCombos;
      } else {
        // Explicit [] means remove all combos
        orderCombos = [];
      }
    }

    // =========================================================
    // 4️⃣ CALCULATE COMBO TOTALS FROM RESULTING ORDER
    // =========================================================

    const combosTotal = orderCombos.reduce(
      (sum, combo) => sum + combo.finalPrice,
      0,
    );

    const comboSaleDiscount = orderCombos.reduce(
      (sum, combo) => sum + (combo.saleDiscount || 0),
      0,
    );

    totalPrice += combosTotal;

    // If combos were not updated, calculate their original
    // values from the existing snapshots/data where possible.
    if (!shouldUpdateCombos) {
      totalSaleDiscount += comboSaleDiscount;
    } else {
      totalSaleDiscount += comboSaleDiscount;
    }

    // =========================================================
    // 5️⃣ OPTIONAL FIELD VALUES
    // =========================================================

    const finalPaymentMethod =
      paymentMethod !== undefined ? paymentMethod : existingOrder.paymentMethod;

    const finalPromoCode =
      promoCode !== undefined
        ? promoCode
        : existingOrder.priceBreakdown?.promoCode;

    const finalTip =
      tip !== undefined
        ? Number(tip || 0)
        : Number(existingOrder.priceBreakdown?.tip || 0);

    if (finalTip < 0) {
      throw new Error("Invalid tip");
    }

    // Tip is added ONCE
    totalPrice += finalTip;

    // =========================================================
    // 6️⃣ PROMO
    // =========================================================

    let promoResult = null;

    if (finalPromoCode) {
      const companyOrganizer = await getOrgCompanyOrganizer(organizationId);

      promoResult = await usePromoCode(
        {
          promoCode: finalPromoCode,
          userId,
          companyOrganizer,
          amount: totalPrice,
        },
        session,
      );

      if (promoResult.error) {
        throw new Error(promoResult.error);
      }

      totalPrice = promoResult.finalAmount;
    }

    // =========================================================
    // 7️⃣ UPDATE DATA
    // =========================================================

    const updateData = {
      status: orderStatus,

      totalPrice,

      priceBreakdown: {
        itemsTotal,
        saleDiscount: totalSaleDiscount,
        promoDiscount: promoResult?.discount || 0,
        tax: 0,
        finalTotal: totalPrice,
        promoCode: finalPromoCode || null,
        tip: finalTip,
      },

      // Optional fields:
      ...(notes !== undefined && {
        notes,
      }),

      ...(paymentMethod !== undefined && {
        paymentMethod,
      }),

      ...(pickupType !== undefined && {
        pickupType,
      }),

      ...(tableNumber !== undefined && {
        tableNumber,
      }),

      // Reset payment lock after update
      lockUntil: new Date(Date.now() + 10 * 60 * 1000),
    };

    // Only replace items if items was sent
    if (shouldUpdateItems) {
      updateData.items = orderItems;
    }

    // Only replace combos if combos was sent
    if (shouldUpdateCombos) {
      updateData.combos = orderCombos;
    }

    // =========================================================
    // 8️⃣ UPDATE ORDER
    // =========================================================

    const updatedOrder = await orderRepo.updateOrder(
      { _id: orderId },
      updateData,
      session,
    );

    if (!updatedOrder) {
      throw new Error("Failed to update order");
    }

    // =========================================================
    // 9️⃣ FORMAT RESPONSE
    // =========================================================

    const formattedOrder = menuItemOrderFormatter(updatedOrder, timezone);

    const userDetails = await findAppUserByIdWithProjectionService(userId, {
      profileIcon: 1,
      firstName: 1,
      lastName: 1,
      email: 1,
      username: 1,
    });

    formattedOrder.user = userDetails;

    // =========================================================
    // 🔟 COMMIT
    // =========================================================

    await session.commitTransaction();
    session.endSession();

    // =========================================================
    // 1️⃣1️⃣ SOCKET EVENT
    // =========================================================

    emitOrderEvent({
      io: global.io,
      eventName: "ORDER_UPDATED",
      orderId: updatedOrder._id,
      organizationId: updatedOrder.organization,
      data: formattedOrder,
    });

    return {
      order: formattedOrder,
    };
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
  userBillingInformation,
  session,
}) => {
  if (!items || !items.length) throw new Error("Cart is empty");

  // 1️⃣ Fetch menu items
  const itemIds = items.map((i) => new mongoose.Types.ObjectId(i.menuItem));

  const menuItems = await menuItemRepo.getMenuItemsWithFilters({
    query: { _id: { $in: itemIds } },
    userId,
    timezone,
  });

  if (!menuItems.length) throw new Error("Invalid items in cart");

  const organizationId = await menuItemRepo.getOrganizationIdByMenuItemId(
    menuItems[0].menu,
  );

  let totalPrice = 0;

  const orderItems = items.map((i) => {
    const menuItem = menuItems.find((m) => m._id.toString() === i.menuItem);
    if (!menuItem) throw new Error(`Invalid menu item: ${i.menuItem}`);

    const priceInfo = calculateItemPrice(menuItem);
    const finalPrice = priceInfo.finalPrice * i.quantity;
    totalPrice += finalPrice;

    return {
      menuItem: menuItem._id,
      quantity: i.quantity,
      unitPrice: priceInfo.originalPrice,
      unitFinalPrice: priceInfo.finalPrice,
      saleDiscountPerUnit: priceInfo.saleDiscount,
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
    userBillingInformation,
    status: "pending",
    orderType: "preorder",
    reservation,
  };

  let order = await orderRepo.createOrder(orderData, session);

  return order;
};

const addMoreItemsToOrder = async ({ orderId, items }) => {
  if (!items || !items.length) throw new Error("No items to add");

  // 1️⃣ Fetch existing order
  const order = await orderRepo.getOrderById(orderId);
  if (!order) throw new Error("Order not found");

  if (order.status === "cancelled")
    throw new Error("Cannot add items to a cancelled order");

  if (order.paymentMethod !== "cash")
    throw new Error("Cannot add items to this order");

  // 2️⃣ Fetch menu items
  const itemIds = items.map((i) => new mongoose.Types.ObjectId(i.menuItem));
  const menuItems = await menuItemRepo.getMenuItemsWithFilters({
    query: { _id: { $in: itemIds } },
  });

  if (!menuItems.length) throw new Error("Invalid items to add");

  let additionalFinalPrice = 0;
  let additionalItemsTotal = 0;
  let additionalSaleDiscount = 0;

  // 3️⃣ Prepare items
  const newOrderItems = items.map((i) => {
    const menuItem = menuItems.find((m) => m._id.toString() === i.menuItem);
    if (!menuItem) throw new Error(`Invalid menu item: ${i.menuItem}`);

    const priceInfo = calculateItemPrice(menuItem);

    const unitPrice = priceInfo.originalPrice;
    const unitFinalPrice = priceInfo.finalPrice;
    const saleDiscountPerUnit = priceInfo.saleDiscount;

    const finalPrice = unitFinalPrice * i.quantity;

    additionalItemsTotal += unitPrice * i.quantity;
    additionalSaleDiscount += saleDiscountPerUnit * i.quantity;
    additionalFinalPrice += finalPrice;

    return {
      menuItem: menuItem._id,
      quantity: i.quantity,
      unitPrice,
      unitFinalPrice,
      saleDiscountPerUnit,
      finalPrice,
      menuItemSnapShot: JSON.parse(JSON.stringify(menuItem)),
    };
  });

  // 4️⃣ Recalculate breakdown
  const newItemsTotal = order.priceBreakdown.itemsTotal + additionalItemsTotal;
  const newSaleDiscount =
    order.priceBreakdown.saleDiscount + additionalSaleDiscount;
  const newFinalTotal = order.totalPrice + additionalFinalPrice;

  // 5️⃣ Update order
  const updatedOrder = await orderRepo.updateOrderWithItems(orderId, {
    newItems: newOrderItems,
    additionalFinalPrice,
    newItemsTotal,
    newSaleDiscount,
    newFinalTotal,
  });

  const formattedOrder = menuItemOrderFormatter(updatedOrder);

  return { order: formattedOrder };
};

// 2️⃣ Get order by ID
const getOrderDetails = async (orderId, timezone) => {
  let order = await orderRepo.getOrderById(orderId);
  if (!order) return null;
  const userID = order.user._id;
  const organizationID = order.organization._id;

  const companyOrganizer = await getOrgCompanyOrganizer(organizationID);
  const wallet = await getWallet(userID, companyOrganizer);
  const reservation = await getLatestUserReservations(
    userID,
    organizationID,
    5,
  );

  let promoCode = null;
  if (reservation) {
    order.reservation = reservation;
  }
  let formattedOrder = menuItemOrderFormatter(order, timezone);
  if (wallet) {
    formattedOrder.loyaltyWallet = {
      levelTitle: wallet.level?.title,
      points: wallet.points,
      lifetimePoints: wallet.lifetimePoints,
    };
  }
  return { order: formattedOrder };
};

// 3️⃣ Get all orders for user
const getUserOrders = async (userId, page, limit) => {
  let [orders, counts] = await Promise.all([
    orderRepo.getOrdersByUser(userId, page, limit),
    orderRepo.getCounts({ user: userId }),
  ]);
  let formattedOrders = orders.map((order) => menuItemOrderFormatter(order));

  let { pending, confirmed, completed, cancelled, totalFiltered } = counts;
  let meta = generateMeta(page, limit, totalFiltered);
  meta.counts = { pending, confirmed, completed, cancelled };
  return { orders: formattedOrders, meta };
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
  updateOrder,
  getOrderDetails,
  getUserOrders,
  updateOrderStatus,
  cancelOrder,
  addMoreItemsToOrder,
  placePreOrderMenuItemsWithReservation,
};
