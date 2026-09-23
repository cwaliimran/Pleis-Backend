const orderRepo = require("./orderRepository");
const menuItemRepo = require("../menuItems/menuItemsRepository");
const mongoose = require("mongoose");
const clubMemberRepo = require("../../loyalty/clubMembers/clubMembersRepository");

const {
  menuItemOrderFormatter,
} = require("./formatter/menuItemOrderFormatter");
const { generateMeta, fireAndForget } = require("../../../helperUtils/responseUtil");
const {
  sendUserNotifications,
} = require("../../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const Organizations = require("@OrganizationModel");
const {
  emitOrderEvent,
  emitOrderUpdate,
} = require("@socketIo/orders/orderSocketEmitter");
const {
  findAppUserByIdWithProjectionService,
} = require("../../usersManagement/usersService");
const {
  getCheckedInStaffForOrganization,
} = require("../../../staff/organizations/organizationRepository");
const {
  usePromoCode,
  calculatePromoDiscount,
  releasePromoCode,
} = require("../../promoCode/promoCodeRepository");
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
const DeliveryOptions = require("@DeliveryOptionsModel");
const {
  getSetttings,
} = require("../../../admin/inAppOrdering/settings/setting/settingRepository");
const {
  isOrderingEnabled,
} = require("../../../admin/menuManagement/menu/menusRepository");
const {
  assertOrganizerBillkoReady,
} = require("../../../commonModules/paymentsIntegrations/billko/billkoCredentials");
const {
  maybeSendFreeMenuOrderConfirmation,
} = require("../../../helperUtils/plainConfirmationEmailService");
const { maybeEnqueueOrderingConfirmation } = require("../../../commonModules/fiscalDocuments/fiscalTiming");
const {
  isAwaitingInAppPayment,
} = require("../../../commonModules/menuItemsAndOrders/orderVisibilityFilter");
const {
  resolvePostOrderFlow,
  resolveStaffNextActions,
  resolveGuestNextStep,
} = require("../../../commonModules/menuItemsAndOrders/orderLifecycle");

const assertPaymentMethodAllowed = (setting, paymentMethod, paymentTiming) => {
  const methods = setting?.paymentMethod || {};
  if (paymentMethod === "cash" && methods.cash !== true) {
    const err = new Error("Cash payment is not enabled for this organization");
    err.statusCode = 400;
    throw err;
  }
  if (
    (paymentMethod === "card" || paymentMethod === "applePay") &&
    methods.inAppPayment !== true
  ) {
    const err = new Error(
      "In-app payment is not enabled for this organization",
    );
    err.statusCode = 400;
    throw err;
  }
  // payNow setting: card/Apple Pay must settle up front; payLater timing only when payNow is off
  if (
    (paymentMethod === "card" || paymentMethod === "applePay") &&
    paymentTiming === "payLater" &&
    methods.payNow === true
  ) {
    const err = new Error(
      "Pay later is not enabled for in-app payments at this organization",
    );
    err.statusCode = 400;
    throw err;
  }
  if (
    (paymentMethod === "card" || paymentMethod === "applePay") &&
    paymentTiming === "payNow" &&
    methods.payNow !== true &&
    methods.inAppPayment === true
  ) {
    // in-app allowed only as settle-later — reject forced payNow
    const err = new Error(
      "Pay now is not enabled for this organization",
    );
    err.statusCode = 400;
    throw err;
  }
};

const orderNeedsConfirmation = (orderItems = [], orderCombos = []) =>
  orderItems.some((item) => item.status === "pending") ||
  orderCombos.some((combo) =>
    (combo.items || []).some(
      (item) => item.menuItemSnapShot?.isRequiresOrderConfirmation,
    ),
  );

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

const resolveComboComponentMenuItemId = (entry) => {
  if (!entry) return null;
  // Nested schema: { menuItem: ObjectId|doc, quantity }
  if (typeof entry === "object" && entry.menuItem != null) {
    const ref = entry.menuItem;
    return ref._id || ref;
  }
  // Legacy flat ObjectId / populated doc
  return entry._id || entry;
};

const validateComboSelection = (cartCombo, combo) => {
  const requiredItemIds = (combo.menuItems || [])
    .map((entry) => resolveComboComponentMenuItemId(entry))
    .filter(Boolean)
    .map((id) => id.toString());
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

    const componentQuantityByItemId = new Map(
      (combo.menuItems || []).map((entry) => {
        const id = resolveComboComponentMenuItemId(entry);
        const componentQty = Number(entry?.quantity);
        return [
          id.toString(),
          Number.isFinite(componentQty) && componentQty > 0 ? componentQty : 1,
        ];
      }),
    );

    const pricedItems = selectedIds.map((id) => {
      const item = comboMenuItems.find((m) => m._id.toString() === id);
      const priceInfo = calculateItemPrice(item);
      return {
        ...item,
        salePrice: priceInfo.finalPrice,
        basePrice: priceInfo.originalPrice,
        quantity: componentQuantityByItemId.get(id) || 1,
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
        quantity: componentQuantityByItemId.get(id) || 1,
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
          image: combo.image || "",
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
  deliveryOption,
  promoCode,
  tip,
  reservationId,
  paymentTiming,
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
    const deliveryOptionData = await DeliveryOptions.findOne({
      _id: deliveryOption,
    }).lean();
    if (deliveryOption && !deliveryOptionData) {
      throw new Error("Invalid delivery option");
    }
    if (items?.length) {
      const itemIds = items.map((i) => new mongoose.Types.ObjectId(i.menuItem));
      menuItems = await menuItemRepo.getMenuItemsWithFilters({
        query: { _id: { $in: itemIds } },
        userId,
        timezone,
      });

      if (!menuItems.length) throw new Error("Invalid items in cart");

      const orgData = await menuItemRepo.getOrganizationIdByMenuItemId(
        menuItems[0].menu,
      );
      organizationId = orgData.organization;
      const isOrderingEnabledForMenu = orgData.isOrderingEnabled;
      if (!isOrderingEnabledForMenu) {
        throw new Error("In-app ordering is not enabled for this organization");
      }
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

      const firstComboItemId = resolveComboComponentMenuItemId(
        comboDocs[0].menuItems?.[0],
      );
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
    await assertOrganizerBillkoReady(companyOrganizer);

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

      const priced = buildPricedMenuItemSnapshot(menuItem);
      const finalPrice = priced.unitFinalPrice * i.quantity;

      itemsTotal += priced.unitPrice * i.quantity;
      totalSaleDiscount += priced.saleDiscountPerUnit * i.quantity;
      totalPrice += finalPrice;

      const status = menuItem.isRequiresOrderConfirmation
        ? "pending"
        : "confirmed";

      return {
        ...priced,
        quantity: i.quantity,
        finalPrice,
        status,
      };
    });

    const isOrderNeedingConfirmation = orderNeedsConfirmation(
      orderItems,
      orderCombos,
    );

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
    }

    const setting = await getSetttings({ organization: organizationId });
    const methods = setting?.paymentMethod || {};
    const isOnlinePayment =
      paymentMethod === "applePay" || paymentMethod === "card";
    // Org setting owns timing for in-app methods (client must not invent payLater when payNow is on)
    const resolvedPaymentTiming = isOnlinePayment
      ? methods.payNow === true
        ? "payNow"
        : "payLater"
      : paymentTiming || "payLater";

    assertPaymentMethodAllowed(setting, paymentMethod, resolvedPaymentTiming);
    totalPrice += Number(tip || 0);
    let orderData = {
      user: userId,
      organization: organizationId,
      items: orderItems,
      combos: orderCombos,
      totalPrice,
      paymentTiming: resolvedPaymentTiming,
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
      pickupType: deliveryOptionData?.deliveryMethod || pickupType,
      tableNumber,
      deliveryOption,
      orderType: "online",
    };

    /*
     * Post-Order Screen Flow (acceptance first, then payment timing):
     * 1) Auto-accept? → Confirmed, else Pending (staff Confirm/Reject) — always board-visible
     * 2) Only when auto-accepted AND Pay now AND in-app amount due:
     *    payment happens before Confirmed → hideUntilPaid until gateway succeeds
     */
    const autoAccepted =
      setting?.automaticOrderAcceptance === true && !isOrderNeedingConfirmation;
    const payNowEnabled = methods.payNow === true;
    const amountDue = Number(totalPrice) > 0;

    let orderStatus = "pending";
    let hideUntilPaid = false;

    if (autoAccepted) {
      if (isOnlinePayment && payNowEnabled && amountDue) {
        // Pay before Confirmed — hidden until gateway succeeds
        orderStatus = "pending";
        hideUntilPaid = true;
        orderData.lockUntil = new Date(Date.now() + 10 * 60 * 1000);
      } else {
        orderStatus = "confirmed";
        // Doc §7.1: cash + Pay now + auto-accept → Paid up front (card still uses hideUntilPaid above)
        if (
          paymentMethod === "cash" &&
          payNowEnabled &&
          amountDue
        ) {
          orderData.paymentStatus = "paid";
          orderData.paidAt = new Date();
        }
      }
    } else {
      // Staff must accept — Pending + Unpaid stays on the board (Confirm / Reject)
      orderStatus = "pending";
    }

    orderData.status = orderStatus;
    orderData.hideUntilPaid = hideUntilPaid;

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
    await session.commitTransaction();
    session.endSession();

    // Emit socket + staff push only when the order is board-visible.
    // Card/Apple Pay pay-now orders wait until payment finalizer emits NEW_ORDER.
    if (!isAwaitingInAppPayment(order)) {
      emitOrderEvent({
        io: global.io,
        eventName: "NEW_ORDER",
        orderId: order._id,
        organizationId: order.organization,
        userId: order.user,
        data: formattedOrder,
      });
      const staffIds = await getCheckedInStaffForOrganization(
        organizationId,
        timezone,
      );

      sendUserNotifications({
        recipientIds: staffIds,
        titleKey: "new_order_placed_title",
        bodyKey: "new_order_placed_body",
        bodyValues: {
          status: formattedOrder.status,
          amount: formattedOrder.totalPrice,
        },
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

    // €0 / free orders never go through payment confirmation fiscal email —
    // send a plain order confirmation at placement.
    if (!(Number(order.totalPrice) > 0)) {
      fireAndForget(
        maybeSendFreeMenuOrderConfirmation(order._id),
        "PLAIN_FREE_MENU_ORDER_CONFIRMATION",
      );
    } else if (order.paymentStatus === "paid") {
      // Cash auto Pay now — confirmation at place (same as mark-paid path)
      maybeEnqueueOrderingConfirmation(order);
    }

    const postOrderFlow = resolvePostOrderFlow({
      autoAccepted,
      paymentTiming: order.paymentTiming,
      hideUntilPaid: order.hideUntilPaid === true,
      status: order.status,
      paymentStatus: order.paymentStatus,
      totalPrice: order.totalPrice,
    });
    formattedOrder.postOrderFlow = postOrderFlow;
    formattedOrder.nextActions = resolveStaffNextActions(order);
    formattedOrder.guestNextStep = resolveGuestNextStep(order);

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
  deliveryOption,
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

    // if (existingOrder.status !== "pending") {
    //   throw new Error("Only orders in pending state can be updated");
    // }

    const organizationId =
      existingOrder.organization?._id || existingOrder.organization;

    // IMPORTANT:
    // undefined = don't update this field
    // [] = explicitly replace with empty array

    const shouldUpdateItems = items !== undefined;
    const shouldUpdateCombos = combos !== undefined;

    let orderItems = existingOrder.items || [];
    let orderCombos = existingOrder.combos || [];

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
          const priced = buildPricedMenuItemSnapshot(menuItem);

          const status = menuItem.isRequiresOrderConfirmation
            ? "pending"
            : "confirmed";

          return {
            ...priced,
            quantity: item.quantity,
            finalPrice: priced.unitFinalPrice * item.quantity,
            status,
          };
        });
      } else {
        // Explicit [] means remove all items
        orderItems = [];
      }
    }

    // =========================================================
    // 3️⃣ UPDATE COMBOS ONLY IF PROVIDED (same shape as placeOrder)
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
        const firstComboItemId = resolveComboComponentMenuItemId(
          comboDocs[0]?.menuItems?.[0],
        );

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

    // Customer updates must not auto-confirm. Card/applePay stay pending until
    // paid (same as placeOrder). Cash may confirm only with auto-accept and
    // no items that require confirmation.
    if (
      (shouldUpdateItems || shouldUpdateCombos) &&
      orderStatus === "pending" &&
      (orderItems.length || orderCombos.length)
    ) {
      const paymentForStatus =
        paymentMethod !== undefined
          ? paymentMethod
          : existingOrder.paymentMethod;
      const isOnlinePayment =
        paymentForStatus === "applePay" || paymentForStatus === "card";
      const needsConfirmation = orderNeedsConfirmation(orderItems, orderCombos);

      if (paymentMethod !== undefined) {
        const settingForMethod = await getSetttings({
          organization: organizationId,
        });
        assertPaymentMethodAllowed(
          settingForMethod,
          paymentMethod,
          existingOrder.paymentTiming,
        );
      }

      if (isOnlinePayment || needsConfirmation) {
        orderStatus = "pending";
      } else {
        const setting = await getSetttings({ organization: organizationId });
        if (setting?.automaticOrderAcceptance === true) {
          orderStatus = "confirmed";
        }
      }
    }

    if (
      (shouldUpdateItems || shouldUpdateCombos) &&
      !orderItems.length &&
      !orderCombos.length
    ) {
      throw new Error("Cart is empty");
    }

    // =========================================================
    // 4️⃣ RECALCULATE TOTALS FROM RESULTING ITEMS + COMBOS
    // =========================================================

    let itemsTotal = 0;
    let totalSaleDiscount = 0;
    let totalPrice = 0;

    for (const item of orderItems) {
      const qty = item.quantity || 0;
      // Fresh lines have unitPrice; older saved items may only have finalPrice
      itemsTotal +=
        item.unitPrice != null ? item.unitPrice * qty : item.finalPrice || 0;
      totalSaleDiscount += (item.saleDiscountPerUnit || 0) * qty;
      totalPrice += item.finalPrice || 0;
    }

    for (const combo of orderCombos) {
      const qty = combo.quantity || 0;
      itemsTotal += (combo.unitPrice || 0) * qty;
      totalSaleDiscount += (combo.saleDiscountPerUnit || 0) * qty;
      totalPrice += combo.finalPrice || 0;
    }

    // =========================================================
    // 5️⃣ OPTIONAL FIELD VALUES
    // =========================================================

    const finalPaymentMethod =
      paymentMethod !== undefined ? paymentMethod : existingOrder.paymentMethod;

    const existingPromoCode = existingOrder.priceBreakdown?.promoCode
      ? String(existingOrder.priceBreakdown.promoCode).trim().toUpperCase()
      : null;

    const finalPromoCode =
      promoCode !== undefined
        ? promoCode && String(promoCode).trim()
          ? String(promoCode).trim().toUpperCase()
          : null
        : existingPromoCode;

    const finalTip =
      tip !== undefined
        ? Number(tip || 0)
        : Number(existingOrder.priceBreakdown?.tip || 0);

    if (finalTip < 0) {
      throw new Error("Invalid tip");
    }

    const existingTip = Number(existingOrder.priceBreakdown?.tip || 0);
    const itemsAndCombosTotal = totalPrice;
    const voucherDiscount = Number(
      existingOrder.priceBreakdown?.voucherDiscount || 0,
    );
    const promoChanged =
      (existingPromoCode || null) !== (finalPromoCode || null);
    const willConsumeUsage = Boolean(finalPromoCode) && promoChanged;

    // =========================================================
    // 6️⃣ PROMO (on items+combos, before tip — same order as placeOrder)
    // =========================================================

    let promoResult = null;

    if (finalPromoCode || (promoChanged && existingPromoCode)) {
      const companyOrganizer = await getOrgCompanyOrganizer(organizationId);

      if (promoChanged && existingPromoCode) {
        await releasePromoCode(
          {
            promoCode: existingPromoCode,
            userId,
            companyOrganizer,
          },
          session,
        );
      }

      if (finalPromoCode) {
        const promoAmount = totalPrice;

        promoResult = willConsumeUsage
          ? await usePromoCode(
              {
                promoCode: finalPromoCode,
                userId,
                companyOrganizer,
                amount: promoAmount,
              },
              session,
            )
          : await calculatePromoDiscount(
              {
                promoCode: finalPromoCode,
                userId,
                companyOrganizer,
                amount: promoAmount,
                skipUsageLimits: true,
              },
              session,
            );

        if (promoResult.error) {
          throw new Error(promoResult.error);
        }

        totalPrice = promoResult.finalAmount;
      }
    }

    if (voucherDiscount > 0) {
      totalPrice -= Math.min(voucherDiscount, totalPrice);
    }

    totalPrice += finalTip;

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
        voucherDiscount,
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
      ...(deliveryOption !== undefined && {
        deliveryOption,
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

    emitOrderUpdate(updatedOrder, ["order"]);

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

    const priced = buildPricedMenuItemSnapshot(menuItem);
    const finalPrice = priced.unitFinalPrice * i.quantity;
    totalPrice += finalPrice;

    return {
      ...priced,
      quantity: i.quantity,
      finalPrice,
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

const addMoreItemsToOrder = async ({
  orderId,
  items,
  userId = null,
  timezone = null,
}) => {
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
    userId,
    timezone,
  });

  if (!menuItems.length) throw new Error("Invalid items to add");

  let additionalFinalPrice = 0;
  let additionalItemsTotal = 0;
  let additionalSaleDiscount = 0;

  // 3️⃣ Prepare items
  const newOrderItems = items.map((i) => {
    const menuItem = menuItems.find((m) => m._id.toString() === i.menuItem);
    if (!menuItem) throw new Error(`Invalid menu item: ${i.menuItem}`);

    const priced = buildPricedMenuItemSnapshot(menuItem);
    const finalPrice = priced.unitFinalPrice * i.quantity;

    additionalItemsTotal += priced.unitPrice * i.quantity;
    additionalSaleDiscount += priced.saleDiscountPerUnit * i.quantity;
    additionalFinalPrice += finalPrice;

    return {
      ...priced,
      quantity: i.quantity,
      finalPrice,
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
  emitOrderUpdate(updatedOrder, ["items"]);

  return { order: formattedOrder };
};

// 2️⃣ Get order by ID
const getOrderDetails = async (orderId, timezone) => {
  let order = await orderRepo.getOrderById(orderId);
  if (!order) return null;
  const userID = order.user._id;
  const organizationID = order.organization._id;

  const companyOrganizer = await getOrgCompanyOrganizer(organizationID);
  
  const wallet = await clubMemberRepo.getWallet(userID, companyOrganizer, null, { autoCreate: false });
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
  if (orderStatusUpdate) {
    emitOrderUpdate(orderStatusUpdate, ["status"]);
  }
  let formattedOrder = menuItemOrderFormatter(orderStatusUpdate);
  return { order: formattedOrder };
};

const cancelOrder = async (orderId) => {
  let order = await orderRepo.updateOrderStatus(orderId, "cancelled");
  if (order) {
    emitOrderUpdate(order, ["status", "cancellation"]);
  }
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
