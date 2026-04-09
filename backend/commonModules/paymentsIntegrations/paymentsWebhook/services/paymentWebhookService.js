const webhookRepository = require("../repositories/webhookRepository");
const { Types, default: mongoose } = require("mongoose");

const { ticketingOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/ticketingOrderFinalizerService");
const { reservationOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/reservationOrderFinalizerService");
const { menuOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/menuOrderFinalizerService");
const { ticketingTransferFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/ticketingTransferFinalizerService");
const { generateMeta, convertTimezoneToUtc } = require("../../../../helperUtils/responseUtil");
const { DASHBOARD_KEYS, TRANSSECTION_KEYS, withSubFilters } = require("../utils/transsectionKeyMap");
const { calculateGrowth } = require("../utils/transsectionDate.utils");
const moment = require("moment");
const processPaymentWebhook = async ({
  provider,
  payload,
}) => {
  const event = await webhookRepository.saveIfNotProcessed({
    provider,
    orderNumber: payload.transaction.orderNumber,
    orderType: payload.transaction.metadata.type,
    user: payload.user,
    companyOrganizer: payload.transaction.metadata.companyOrganizer,
    organization: payload.transaction.metadata.organization,
    transactionId: payload.transaction.id,
    paymentStatus: payload.transaction.status,
    amount: payload.transaction.amount,
    payload,
  });

  // 👇 EXPLICIT RESULT
  if (!event) {
    return {
      handled: false,
      reason: "duplicate event",
    };
  }
  let orderType = payload.transaction.metadata.type;
  let orderId = payload.transaction.orderNumber;
  const result = {
    status: payload.transaction.status,
    transactionId: payload.transaction.id,
  };

  if (orderType === "ticketingbookings") {
    await ticketingOrderFinalizerService({ orderId, result });
  }

  if (orderType === "tickettransfer") {
    let metadata = payload.transaction.metadata
    await ticketingTransferFinalizerService({ bookingId: metadata.bookingId, userId: metadata.userId, newUserId: metadata.newUserId, result: payload.transaction });
  }

  if (orderType === "userreservations") {
    await reservationOrderFinalizerService({
      reservationId: orderId,
      result,
    });
  }
  if (orderType === "menuorders") {
    await menuOrderFinalizerService({
      menuOrderId: orderId,
      result,
    });
  }

  return {
    handled: true,
  };
};


const getOrdersTransactionsService = async ({
  page = 1,
  limit = 10,
  keyword,
  status,
  date,
  startDate,
  endDate,
  companyOrganizer,
  organization,
  orderType,
  startAmount,
  endAmount,
  paymentMethod,
  globalStatusLevel,
  event,
  transfered,
  refunded,
  validationStatus,
  paymentStatus,
  resStartDate, resEndDate,
  resDate,
  resStartTime,
  resEndTime,
  timezone,
  futureRes,
  pastRes,
  minimalSpendRes,
  prePay,
  ticketRequiredRes,
  cancelledRes,
  noShowRes,
  orderStatus,
  deliveryMethod,
  category,
  menuSaleItme,
  promotionOrders,
  eventBasedOrder

}) => {

  const match = {};

  if (companyOrganizer) match.companyOrganizer = new mongoose.Types.ObjectId(companyOrganizer);
  if (organization) match.organization = { $in: organization };
  if (status) match.paymentStatus = status;
  if (orderType) match.orderType = orderType;
  if (paymentMethod) match.paymentMethod = paymentMethod;
  if (paymentStatus) match.paymentStatus = paymentStatus;
  if (validationStatus) match.validationStatus = validationStatus;
  if (minimalSpendRes) {
    match.$expr = {
      $gte: [{ $toDouble: "$amount" }, Number(minimalSpendRes)]
    }
  }


  if (startDate || endDate || date) {
    match.createdAt = {};
    if (startDate) match.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      match.createdAt.$lte = end;
    }
    if (date) {
      match.createdAt.$gte = new Date(date);
      match.createdAt.$lt = new Date(new Date(date).setDate(new Date(date).getDate() + 1));
    }
    if (!Object.keys(match.createdAt).length) delete match.createdAt;
  }
  if (
    startAmount !== undefined && startAmount !== null && startAmount !== "" ||
    endAmount !== undefined && endAmount !== null && endAmount !== ""
  ) {
    match.$expr = {};
    const conditions = [];

    if (startAmount !== undefined && startAmount !== null && startAmount !== "") {
      conditions.push({
        $gte: [{ $toDouble: "$amount" }, Number(startAmount)],
      });
    }

    if (endAmount !== undefined && endAmount !== null && endAmount !== "") {
      conditions.push({
        $lte: [{ $toDouble: "$amount" }, Number(endAmount)],
      });
    }

    if (conditions.length === 1) {
      match.$expr = conditions[0];
    } else {
      match.$expr = { $and: conditions };
    }
  }


  const skip = (page - 1) * limit; ``
  let resStartTimeUtc, resEndTimeUtc;
  if (resDate) {
    if (resStartTime) {
      // Convert the start date + time to UTC using the existing convertTimezoneToUtc function
      console.log("resStartTime", resStartTime);
      console.log("resEndTime", resEndTime);

      resStartTimeUtc = convertTimezoneToUtc(
        `${resDate} ${resStartTime}`,
        timezone,
        "YYYY-MM-DD hh:mm",
        "YYYY-MM-DDTHH:mm:ss.SSSZ" // Ensure UTC format with 'Z'
      );
      resStartTimeUtc = new Date(resStartTimeUtc.replace("+00:00", "Z"));
    }

    if (resEndTime) {
      // Convert the end date + time to UTC using the existing convertTimezoneToUtc function
      resEndTimeUtc = convertTimezoneToUtc(
        `${resDate} ${resEndTime}`,
        timezone,
        "YYYY-MM-DD hh:mm",
        "YYYY-MM-DDTHH:mm:ss.SSSZ" // Ensure UTC format with 'Z'
      );
      resEndTimeUtc = new Date(resEndTimeUtc.replace("+00:00", "Z"));
    }
  }
  // Now you can use resStartTimeUtc and resEndTimeUtc for comparison in MongoDB


  const [transactions, totalFiltered] = await Promise.all([
    webhookRepository.getOrdersTransactions({ match, keyword, skip, limit, paymentMethod, globalStatusLevel, event, transfered, refunded, validationStatus, orderType, resStartDate, resEndDate, resDate, resStartTimeUtc, resEndTimeUtc, futureRes, pastRes, prePay, ticketRequiredRes, cancelledRes, noShowRes, orderStatus, deliveryMethod, category, menuSaleItme,promotionOrders,eventBasedOrder }),
    webhookRepository.countOrdersTransactions({  match, keyword,paymentMethod, globalStatusLevel, event, transfered, refunded, validationStatus, orderType, resStartDate, resEndDate, resDate, resStartTimeUtc, resEndTimeUtc, futureRes, pastRes, prePay, ticketRequiredRes, cancelledRes, noShowRes, orderStatus, deliveryMethod, category, menuSaleItme,promotionOrders,eventBasedOrder })
  ]);
  const meta = generateMeta(page, limit, totalFiltered);
  return {
    transactions,
    meta
  };
};

const getOrdersTransactionDetailsService = async ({ id }) => {
  if (!Types.ObjectId.isValid(id)) {
    throw new Error("invalid_transaction_id");
  }
  const transactionDetails = await webhookRepository.getOrdersTransactionDetails({ id });

  if (!transactionDetails) {
    throw new Error("transaction_not_found");
  }
  return transactionDetails;
};

const getTransactionStatsService = async ({ dateFilter, timezone, companyOrganizer, organizations }) => {
  const stats = await webhookRepository.getTransactionStats({ dateFilter, timezone, companyOrganizer, organizations });
  return {
    stats: [
      // ---------------- USERS ----------------
      {    // used 
        key: "totalTransactions",
        title: TRANSSECTION_KEYS.totalTransactions.title,
        value: stats.totalTransactionsCurrent || 0,
        growth: calculateGrowth(
          stats.totalTransactionsCurrent,
          stats.totalTransactionsPrevious
        ),
        ...withSubFilters("totalTransactions"),
      },
      {
        key: "totalAmount",
        title: TRANSSECTION_KEYS.totalAmount.title,
        value: stats.totalAmountCurrent || 0,
        growth: calculateGrowth(
          stats.totalAmountCurrent,
          stats.totalAmountPrevious
        ),
        ...withSubFilters("totalAmount"),
      },
      // {  // used
      //  key: "totalUsers",
      //  title: TRANSSECTION_KEYS.totalUsers.title,
      //   value: stats.totalUsersCurrent || 0,
      //   growth: calculateGrowth(
      //    stats.totalUsersCurrent,
      //    stats.totalUsersPrevious
      //   ),
      //   ...withSubFilters("totalUsers"),
      // },

      {
        key: "totalCommission",  // used 
        title: TRANSSECTION_KEYS.totalCommission.title,
        value: stats.totalCommissionCurrent || 0,
        growth: calculateGrowth(
          stats.totalCommissionCurrent,
          stats.totalCommissionPrevious
        ),
        ...withSubFilters("totalCommission"),
      },
      {
        key: "serviceFee",  // used 
        title: TRANSSECTION_KEYS.serviceFee.title,
        value: stats.serviceFeeCurrent || 0,
        growth: calculateGrowth(
          stats.serviceFeeCurrent,
          stats.serviceFeePrevious
        ),
        ...withSubFilters("serviceFee"),
      },
      {
        key: "organizerPayout",  // used 
        title: TRANSSECTION_KEYS.organizerPayout.title,
        value: stats.totalOrganizerPayoutCurrent || 0,
        growth: calculateGrowth(
          stats.totalOrganizerPayoutCurrent,
          stats.totalOrganizerPayoutPrevious
        ),
        ...withSubFilters("organizerPayout"),
      },

    ].filter(Boolean)
  };
};

module.exports = { processPaymentWebhook, getOrdersTransactionsService, getOrdersTransactionDetailsService, getTransactionStatsService };
