const webhookRepository = require("../repositories/webhookRepository");
const { Types, default: mongoose } = require("mongoose");

const { ticketingOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/ticketingOrderFinalizerService");
const { reservationOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/reservationOrderFinalizerService");
const { menuOrderFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/menuOrderFinalizerService");
const { ticketingTransferFinalizerService } = require("../../dummyChargeForTesting/orderFinalizers/ticketingTransferFinalizerService");
const { generateMeta } = require("../../../../helperUtils/responseUtil");

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
  orderType
}) => {

  const match = {};

  if (companyOrganizer) match.companyOrganizer = new mongoose.Types.ObjectId(companyOrganizer);
  if (organization) match.organization = new mongoose.Types.ObjectId(organization);
  if (status) match.paymentStatus = status;
  if (orderType) match.orderType = orderType;

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

  const skip = (page - 1) * limit;


  const [transactions, totalFiltered] = await Promise.all([
    webhookRepository.getOrdersTransactions({ match, keyword, skip, limit }),
    webhookRepository.countOrdersTransactions({ match, keyword })
  ]);

  return {
    transactions,
    meta: {
      currentPage: page,
      totalPages: Math.ceil(totalFiltered / limit),
      totalRecords: totalFiltered,
      limit
    }
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


module.exports = { processPaymentWebhook, getOrdersTransactionsService, getOrdersTransactionDetailsService };
