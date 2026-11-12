/**
 * Edit order — before payment only (Requirement Set #129, #130; Order
 * Statuses v2.2.2 §3.2; Pleis decision of 27.10.2026).
 *
 *   - While Payment = Unpaid, whatever the fulfilment status, staff change the
 *     order in agreement with the guest: add a line, remove one, change a
 *     quantity, the table / destination, notes, and the payment method.
 *   - Once Paid nothing is edited; the correction is a refund (#139).
 *   - The total, the promo and the voucher draw-down are recalculated, so the
 *     order stays one order and one transaction. Loyalty points are computed
 *     at payment from the final total, so they follow automatically.
 *   - The payment is recorded as a composition: a voucher component plus the
 *     method, with amounts that sum exactly to the order total (#130).
 *   - Every edit records actor, time, channel and the previous contents
 *     (checklist IAO-34).
 *
 * Existing lines keep the price they were ordered at; only new lines are
 * priced now.
 */
const mongoose = require("mongoose");
const MenuOrders = require("@OrdersModel");
const DeliveryOptions = require("@DeliveryOptionsModel");
const { UserReservations } = require("@UserReservationsModel");
const { NotificationTypes } = require("@NotificationsModel");
const { emitOrderUpdate } = require("@socketIo/orders/orderSocketEmitter");
const orderService = require("../../app/menuItemsAndOrdering/orders/orderService");
const menuItemRepo = require("../../app/menuItemsAndOrdering/menuItems/menuItemsRepository");
const { getSetttings } = require("../../admin/inAppOrdering/settings/setting/settingRepository");
const { calculatePromoDiscount } = require("../../app/promoCode/promoCodeRepository");
const { getOrgCompanyOrganizer } = require("../../app/organizationProfile/organizationProfileRepository");
const { sendUserNotifications } = require("../../controllers/communicationController");
const { fireAndForget } = require("../../helperUtils/responseUtil");
const { buildPaymentMethodLabel, VOUCHER_METHOD, isPleisMethod } = require("./paymentMethods");
const {
  CLOSED_FULFILMENT_STATUSES,
  normalizeFulfilmentStatus,
  resolveStaffNextActions,
  resolveGuestNextStep,
} = require("./orderLifecycle");

const UNPAID = new Set(["pending", "failed"]);
const PAYMENT_IN_PROGRESS_MS = 15 * 60 * 1000;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const httpError = (statusCode, message) => {
  const err = new Error(message);
  err.statusCode = statusCode;
  return err;
};
const plain = (doc) => (doc && typeof doc.toObject === "function" ? doc.toObject() : doc);

/** Is the order editable at all? Used by the edit endpoints and the UIs. */
const canEditOrder = (order) =>
  Boolean(order) &&
  UNPAID.has(order.paymentStatus) &&
  !CLOSED_FULFILMENT_STATUSES.includes(normalizeFulfilmentStatus(order.status));

function assertEditable(order) {
  if (!UNPAID.has(order.paymentStatus)) throw httpError(409, "order_locked_after_payment");
  if (CLOSED_FULFILMENT_STATUSES.includes(normalizeFulfilmentStatus(order.status))) {
    throw httpError(409, "order_closed_for_edit");
  }
}

/** A guest checkout through Pleis started minutes ago must not change under them. */
async function assertNoPaymentInProgress(order) {
  if (!isPleisMethod(order.paymentMethod)) return;
  const recent = await mongoose.connection.db.collection("monritransactions").findOne({
    orderNumber: String(order._id),
    status: "pending",
    createdAt: { $gte: new Date(Date.now() - PAYMENT_IN_PROGRESS_MS) },
  });
  if (recent) throw httpError(409, "payment_in_progress");
}

function snapshot(order) {
  const o = plain(order);
  return {
    items: (o.items || []).map((l) => ({
      lineId: String(l._id),
      menuItem: String(l.menuItem),
      title: l.menuItemSnapShot?.title || "",
      quantity: l.quantity,
      unitFinalPrice: l.unitFinalPrice ?? null,
      finalPrice: l.finalPrice,
    })),
    combos: (o.combos || []).map((c) => ({
      lineId: String(c._id),
      combo: String(c.combo),
      title: c.comboSnapShot?.title || "",
      quantity: c.quantity,
      finalPrice: c.finalPrice,
    })),
    tableNumber: o.tableNumber ?? null,
    pickupType: o.pickupType ?? null,
    deliveryOption: o.deliveryOption ? String(o.deliveryOption) : null,
    notes: o.notes || "",
    paymentMethod: o.paymentMethod,
    paymentMethodLabel: o.paymentMethodLabel || "",
    paymentComposition: o.paymentComposition || [],
    priceBreakdown: o.priceBreakdown || {},
    totalPrice: o.totalPrice,
  };
}

async function buildItems(order, items, timezone, organizationId) {
  if (!Array.isArray(items)) throw httpError(400, "items_must_be_array");
  const existing = new Map((order.items || []).map((l) => [String(l._id), plain(l)]));
  // A client that sends no line ids (one row per menu item) keeps the price
  // the item was ordered at: match it to an existing line of that item.
  const byMenuItem = new Map();
  for (const l of existing.values()) {
    if (!byMenuItem.has(String(l.menuItem))) byMenuItem.set(String(l.menuItem), String(l._id));
  }
  const claimed = new Set(items.filter((i) => i.lineId).map((i) => String(i.lineId)));
  items = items.map((i) => {
    if (i.lineId) return i;
    const lineId = byMenuItem.get(String(i.menuItem));
    if (lineId && !claimed.has(lineId)) {
      claimed.add(lineId);
      return { ...i, lineId };
    }
    return i;
  });
  const seen = new Set();
  const fresh = items.filter((i) => !(i.lineId && existing.has(String(i.lineId))));
  const freshIds = fresh.map((i) => {
    if (!mongoose.Types.ObjectId.isValid(String(i.menuItem))) throw httpError(400, "invalid_menu_item");
    return new mongoose.Types.ObjectId(String(i.menuItem));
  });

  let menuItems = [];
  if (freshIds.length) {
    menuItems = await menuItemRepo.getMenuItemsWithFilters({
      query: { _id: { $in: freshIds } },
      userId: order.user,
      timezone,
    });
    for (const m of menuItems) {
      const found = await menuItemRepo.getOrganizationIdByMenuItemId(m.menu);
      const orgId = found?.organization ?? found;
      if (String(orgId) !== String(organizationId)) throw httpError(400, "item_not_from_this_venue");
    }
  }

  return items.map((i) => {
    const qty = Number(i.quantity);
    if (!Number.isInteger(qty) || qty < 1) throw httpError(400, "invalid_quantity");
    if (i.lineId && existing.has(String(i.lineId))) {
      if (seen.has(String(i.lineId))) throw httpError(400, "duplicate_order_line");
      seen.add(String(i.lineId));
      const line = existing.get(String(i.lineId));
      const unit = line.unitFinalPrice ?? round2((line.finalPrice || 0) / (line.quantity || 1));
      return { ...line, quantity: qty, unitFinalPrice: unit, finalPrice: round2(unit * qty) };
    }
    const menuItem = menuItems.find((m) => String(m._id) === String(i.menuItem));
    if (!menuItem) throw httpError(400, "menu_item_not_available");
    const priced = orderService.buildPricedMenuItemSnapshot(menuItem);
    const needsConfirm =
      order.status === "pending" && menuItem.isRequiresOrderConfirmation === true;
    return {
      ...priced,
      quantity: qty,
      finalPrice: round2(priced.unitFinalPrice * qty),
      status: needsConfirm ? "pending" : "confirmed",
      isdelivered: false,
    };
  });
}

async function buildCombos(order, combos, timezone) {
  if (!Array.isArray(combos)) throw httpError(400, "combos_must_be_array");
  const existing = new Map((order.combos || []).map((c) => [String(c._id), plain(c)]));
  const claimed = new Set();
  const kept = [];
  const fresh = [];
  for (const c of combos) {
    const qty = Number(c.quantity);
    if (!Number.isInteger(qty) || qty < 1) throw httpError(400, "invalid_quantity");
    let lineId = c.lineId && existing.has(String(c.lineId)) ? String(c.lineId) : null;
    if (!lineId) {
      // Same combo with the same components → the existing line and its price.
      const wanted = (c.items || []).map(String).sort().join();
      for (const [id, line] of existing) {
        const parts = (line.items || []).map((x) => String(x.menuItem?._id || x.menuItem)).sort().join();
        if (!claimed.has(id) && String(line.combo) === String(c.combo) && (!wanted || parts === wanted)) {
          lineId = id;
          break;
        }
      }
    }
    if (lineId && !claimed.has(lineId)) {
      claimed.add(lineId);
      const line = existing.get(lineId);
      const unit = line.unitFinalPrice ?? round2((line.finalPrice || 0) / (line.quantity || 1));
      kept.push({ ...line, quantity: qty, finalPrice: round2(unit * qty) });
    } else {
      fresh.push({ combo: String(c.combo), items: (c.items || []).map(String), quantity: qty });
    }
  }
  if (!fresh.length) return kept;
  const comboDocs = await menuItemRepo.getMenuItemsCombosWithFilters({
    query: { _id: { $in: fresh.map((c) => new mongoose.Types.ObjectId(c.combo)) } },
  });
  const { orderCombos } = await orderService.buildOrderCombos({
    combos: fresh,
    comboDocs,
    userId: order.user,
    timezone,
  });
  return [...kept, ...orderCombos];
}

/** Totals, promo and voucher draw-down from the edited lines (#129). */
async function recalculate(order, session) {
  let itemsTotal = 0;
  let saleDiscount = 0;
  let afterItems = 0;
  for (const l of order.items || []) {
    const qty = l.quantity || 0;
    itemsTotal += l.unitPrice != null ? l.unitPrice * qty : l.finalPrice || 0;
    saleDiscount += (l.saleDiscountPerUnit || 0) * qty;
    afterItems += l.finalPrice || 0;
  }
  for (const c of order.combos || []) {
    const qty = c.quantity || 0;
    itemsTotal += (c.unitPrice || 0) * qty;
    saleDiscount += (c.saleDiscountPerUnit || 0) * qty;
    afterItems += c.finalPrice || 0;
  }
  afterItems = round2(afterItems);

  const pb = plain(order.priceBreakdown) || {};
  let afterPromo = afterItems;
  let promoDiscount = 0;
  if (pb.promoCode) {
    const companyOrganizer = await getOrgCompanyOrganizer(order.organization);
    const promo = await calculatePromoDiscount(
      {
        promoCode: pb.promoCode,
        userId: order.user,
        companyOrganizer,
        amount: afterItems,
        skipUsageLimits: true,
      },
      session,
    );
    if (promo.error) throw httpError(400, promo.error);
    afterPromo = round2(promo.finalAmount);
    promoDiscount = round2(promo.discount || 0);
  }

  // Voucher: draw what the edited order needs, up to what the voucher holds
  // (its remaining balance plus what this order already took).
  const prevDraw = round2(pb.voucherDiscount || 0);
  let voucherDraw = 0;
  if (order.reservation && prevDraw > 0) {
    const reservation = await UserReservations.findById(order.reservation)
      .select("voucher")
      .session(session);
    const v = reservation?.voucher || {};
    const total = round2(v.discountAmount || 0);
    const used = round2(v.usedAmount || 0);
    const available = round2(Math.max(total - used, 0) + prevDraw);
    voucherDraw = round2(Math.min(available, afterPromo));
    const delta = round2(voucherDraw - prevDraw);
    if (delta !== 0) {
      const newUsed = round2(used + delta);
      const updated = await UserReservations.findOneAndUpdate(
        { _id: order.reservation, "voucher.usedAmount": v.usedAmount ?? 0 },
        {
          $set: {
            "voucher.usedAmount": newUsed,
            "voucher.status": round2(total - newUsed) <= 0 ? "applied" : "pending",
          },
        },
        { session, new: true },
      );
      if (!updated) throw httpError(409, "voucher_balance_changed");
    }
  }

  const tip = round2(pb.tip || 0);
  const due = round2(afterPromo - voucherDraw + tip);
  order.priceBreakdown = {
    ...pb,
    itemsTotal: round2(itemsTotal),
    saleDiscount: round2(saleDiscount),
    promoDiscount,
    voucherDiscount: voucherDraw,
    finalTotal: due,
    tip,
  };
  order.totalPrice = due;
  return { orderTotal: round2(afterPromo + tip), voucherDraw, due };
}

function buildComposition(order, { orderTotal, voucherDraw, due }) {
  const parts = [];
  if (voucherDraw > 0) {
    parts.push({ type: VOUCHER_METHOD, amount: voucherDraw, reservation: order.reservation });
  }
  if (due > 0) parts.push({ type: order.paymentMethod, amount: due });
  const sum = round2(parts.reduce((s, p) => s + p.amount, 0));
  if (sum !== orderTotal) throw httpError(500, "payment_composition_mismatch");
  return parts;
}

/**
 * @param {object} p
 * @param {string} p.orderId
 * @param {{ userId, name, role, via: "mobile_staff_app"|"web_admin_app" }} p.actor
 * @param {{ items?, combos?, tableNumber?, pickupType?, deliveryOption?, notes?, paymentMethod? }} p.input
 */
async function editOrderBeforePayment({ orderId, actor, input = {}, timezone, assertScope }) {
  if (!mongoose.Types.ObjectId.isValid(String(orderId))) throw httpError(400, "invalid_order_id");
  const session = await mongoose.startSession();
  let order;
  let changes = [];
  let becamePaid = false;
  try {
    await session.withTransaction(async () => {
      order = await MenuOrders.findById(orderId).session(session);
      if (!order) throw httpError(404, "order_not_found");
      if (assertScope) await assertScope(order);
      assertEditable(order);
      await assertNoPaymentInProgress(order);

      const previous = snapshot(order);
      changes = [];
      const organizationId = order.organization?._id || order.organization;

      if (input.items !== undefined) {
        order.items = await buildItems(order, input.items, timezone, organizationId);
      }
      if (input.combos !== undefined) {
        order.combos = await buildCombos(order, input.combos, timezone);
      }
      if (!(order.items || []).length && !(order.combos || []).length) {
        throw httpError(400, "cart_empty");
      }

      if (input.deliveryOption !== undefined && input.deliveryOption !== null) {
        if (!mongoose.Types.ObjectId.isValid(String(input.deliveryOption))) {
          throw httpError(400, "invalid_delivery_option");
        }
        const option = await DeliveryOptions.findById(input.deliveryOption).select("organization").lean();
        if (!option || String(option.organization) !== String(organizationId)) {
          throw httpError(400, "invalid_delivery_option");
        }
        order.deliveryOption = input.deliveryOption;
      }
      if (input.pickupType !== undefined) {
        if (!["counter", "tableService"].includes(input.pickupType)) {
          throw httpError(400, "invalid_pickup_type");
        }
        order.pickupType = input.pickupType;
      }
      if (input.tableNumber !== undefined) order.tableNumber = input.tableNumber || undefined;
      if (order.pickupType === "tableService" && !order.tableNumber) {
        throw httpError(400, "table_number_required");
      }
      if (input.notes !== undefined) order.notes = String(input.notes || "");

      const totals = await recalculate(order, session);

      // Payment method (#130): the guest's declared method; a voucher alone
      // only when it covers the whole order.
      let method = input.paymentMethod !== undefined ? input.paymentMethod : order.paymentMethod;
      if (totals.due <= 0 && totals.voucherDraw > 0) {
        method = VOUCHER_METHOD;
      } else if (method === VOUCHER_METHOD) {
        throw httpError(400, input.paymentMethod === VOUCHER_METHOD ? "voucher_does_not_cover_order" : "payment_method_required");
      } else {
        const setting = await getSetttings({ organization: organizationId });
        orderService.assertPaymentMethodAllowed(setting, method, order.paymentTiming);
      }
      order.paymentMethod = method;
      order.paymentMethodLabel = buildPaymentMethodLabel({
        paymentMethod: method,
        voucherAmount: totals.voucherDraw,
      });
      order.paymentComposition = buildComposition(order, totals);

      const next = snapshot(order);
      const differs = (k) => JSON.stringify(previous[k]) !== JSON.stringify(next[k]);
      for (const k of ["items", "combos", "tableNumber", "pickupType", "deliveryOption", "notes", "paymentMethod"]) {
        if (differs(k)) changes.push(k);
      }
      if (differs("totalPrice") || differs("paymentComposition")) changes.push("total");
      if (!changes.length) throw httpError(400, "nothing_to_change");

      order.editHistory = [
        ...(order.editHistory || []),
        {
          at: new Date(),
          by: actor.userId,
          byName: actor.name || "",
          byRole: actor.role || "",
          via: actor.via,
          changes,
          previous,
          next: {
            totalPrice: next.totalPrice,
            paymentMethodLabel: next.paymentMethodLabel,
            paymentComposition: next.paymentComposition,
            lines: next.items.length + next.combos.length,
          },
        },
      ];
      order.updateHistory = [
        ...(order.updateHistory || []),
        { updatedAt: new Date(), updatedBy: actor.userId, updateData: { editOrder: changes } },
      ];

      // The voucher now covers everything: the order is settled by it.
      if (totals.due <= 0 && totals.voucherDraw > 0) {
        order.paymentStatus = "paid";
        order.paidAt = new Date();
        becamePaid = true;
      }
      await order.save({ session });
    });
  } finally {
    session.endSession();
  }

  emitOrderUpdate(order, ["order"]);
  sendUserNotifications({
    recipientIds: [String(order.user)],
    titleKey: "order_updated_title",
    bodyKey: "order_updated_body",
    bodyValues: { orderNumber: order.orderNumber, status: order.status },
    data: { type: NotificationTypes.ORDER_UPDATE, objectType: "menuorders" },
    sender: order.organization,
    objectId: order._id,
  });
  if (becamePaid) {
    const { menuOrderFinalizerService } = require("../paymentsIntegrations/dummyChargeForTesting/orderFinalizers/menuOrderFinalizerService");
    const { maybeEnqueueOrderingConfirmation } = require("../fiscalDocuments/fiscalTiming");
    fireAndForget(
      menuOrderFinalizerService({ menuOrderId: order._id, result: { status: "paid", transactionId: order.transactionId || null } }),
      "MENU_ORDER_EDIT_VOUCHER_PAID",
    );
    maybeEnqueueOrderingConfirmation(order);
  }

  const out = plain(order);
  out.nextActions = resolveStaffNextActions(order);
  out.guestNextStep = resolveGuestNextStep(order);
  out.canEdit = canEditOrder(order);
  out.editChanges = changes;
  return out;
}

module.exports = { editOrderBeforePayment, canEditOrder, snapshot };
