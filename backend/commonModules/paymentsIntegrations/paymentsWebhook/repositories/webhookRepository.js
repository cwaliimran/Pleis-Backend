const { formatImages } = require("../formator/formateWebhook");
const WebhookEvent = require("./WebhookTransactionsEvent.model");
const mongoose = require("mongoose");

const saveIfNotProcessed = async (data) => {
  try {
    return await WebhookEvent.create(data);
  } catch (err) {
    if (err.code === 11000) return null; // already processed
    throw err;
  }
};


/* =========================================================
   🔎 KEYWORD MATCH BUILDER
========================================================= */


const buildKeywordMatch = (keyword) => {
  if (!keyword?.trim()) return null;

  const regex = new RegExp(keyword, "i");

  const orConditions = [

    /* =========================
       🔹 TRANSACTION FIELDS
    ========================== */
    { provider: regex },
    { orderType: regex },
    { paymentStatus: regex },
    { transactionId: regex },

    /* =========================
       🔹 USER FIELDS
    ========================== */
    { "user.firstName": regex },
    { "user.lastName": regex },
    { "user.email": regex },
    { "user.username": regex },

    /* =========================
       🔹 ORGANIZER FIELDS
    ========================== */
    { "companyOrganizer.firstName": regex },
    { "companyOrganizer.lastName": regex },
    { "companyOrganizer.username": regex },
    { "companyOrganizer.email": regex },
    { "companyOrganizer.companyDetails.loyaltySettings.title": regex },

    /* =========================
       🔹 ORGANIZATION FIELDS
    ========================== */
    { "organization.basicInfo.name": regex }
  ];

  /* =========================
     🔹 SAFE OBJECT ID SEARCH
  ========================== */
  if (mongoose.Types.ObjectId.isValid(keyword)) {
    orConditions.push({
      orderNumber: new mongoose.Types.ObjectId(keyword)
    });
  }

  return { $or: orConditions };
};

/* =========================================================
   📦 GET TRANSACTIONS (WITH FILTERS + PAGINATION)
========================================================= */
const getOrderPaymentMethod = async (transactionDetails = {}) => {
  let paymentMethod = null;

  if (!transactionDetails.orderType || !transactionDetails.orderNumber) {
    return paymentMethod;
  }

  const modelMap = {
    ticketingbookings: "TicketingBookings",
    menuorders: "MenuOrders",
    userreservations: "UserReservations",
    tickettransfer: "TicketingBookings",
    ticketingorder: "TicketingOrder",
    ticketingorders: "TicketingOrder",
  };

  const modelName = modelMap[transactionDetails.orderType.toLowerCase()];

  if (!modelName) return paymentMethod;

  try {
    const Model = mongoose.model(modelName);

    if (modelName === "MenuOrders") {
      const orderData = await Model.findById(transactionDetails.orderNumber)
        .select("paymentMethod paymentType paymentOption")
        .lean();

      paymentMethod =
        orderData?.paymentMethod ||
        orderData?.paymentType ||
        orderData?.paymentOption ||
        null;
    } else if (modelName === "TicketingOrder") {
      const orderData = await Model.findById(transactionDetails.orderNumber)
        .select("paymentMethod paymentType paymentOption")
        .lean();

      paymentMethod =
        orderData?.paymentMethod ||
        orderData?.paymentType ||
        orderData?.paymentOption ||
        null;
    } else if (modelName === "TicketingBookings") {
      const orderData = await Model.aggregate([
        {
          $match: {
            _id: new mongoose.Types.ObjectId(transactionDetails.orderNumber),
          },
        },
        {
          $lookup: {
            from: "ticketingorders",
            localField: "order",
            foreignField: "_id",
            as: "order",
          },
        },
        {
          $unwind: {
            path: "$order",
            preserveNullAndEmptyArrays: true,
          },
        },
        {
          $project: {
            paymentMethod: "$order.paymentMethod",
            paymentType: "$order.paymentType",
            paymentOption: "$order.paymentOption",
          },
        },
        { $limit: 1 },
      ]).exec();

      paymentMethod =
        orderData?.[0]?.paymentMethod ||
        orderData?.[0]?.paymentType ||
        orderData?.[0]?.paymentOption ||
        null;
    } else if (modelName === "UserReservations") {
      const orderData = await Model.findById(transactionDetails.orderNumber)
        .select("paymentMethod paymentType paymentOption")
        .lean();

      paymentMethod =
        orderData?.paymentMethod ||
        orderData?.paymentType ||
        orderData?.paymentOption ||
        null;
    } else {
      const orderData = await Model.findById(transactionDetails.orderNumber)
        .select("paymentMethod paymentType paymentOption")
        .lean();

      paymentMethod =
        orderData?.paymentMethod ||
        orderData?.paymentType ||
        orderData?.paymentOption ||
        null;
    }
  } catch (err) {
    console.error("Error fetching payment method:", err);
  }

  return paymentMethod;
};

const getOrdersTransactions = async ({
  match = {},
  keyword,
  paymentMethod,
  skip = 0,
  limit = 10
}) => {
  if (!keyword?.trim()) {
    const pipeline = [];

    if (Object.keys(match).length) {
      pipeline.push({ $match: match });
    }

    pipeline.push(
      { $sort: { createdAt: -1, _id: -1 } },
      {
        $lookup: {
          from: "organizations",
          localField: "organization",
          foreignField: "_id",
          as: "organization"
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user"
        }
      },
      {
        $addFields: {
          organization: { $arrayElemAt: ["$organization", 0] },
          user: { $arrayElemAt: ["$user", 0] }
        }
      },
      {
        $project: {
          provider: 1,
          orderType: 1,
          orderNumber: 1,
          paymentStatus: 1,
          transactionId: 1,
          amount: 1,
          payload: 1,
          createdAt: 1,
          updatedAt: 1,

          organization: {
            _id: "$organization._id",
            name: "$organization.basicInfo.name"
          },

          user: {
            _id: "$user._id",
            username: "$user.username",
            firstName: "$user.firstName",
            lastName: "$user.lastName",
            email: "$user.email"
          }
        }
      }
    );

    const transactions = await WebhookEvent.aggregate(pipeline, { allowDiskUse: true });

    const updatedTransactions = await Promise.all(
      transactions.map(async (transaction) => {
        const paymentMethodValue = await getOrderPaymentMethod({
          orderType: transaction.orderType,
          orderNumber: transaction.orderNumber,
        });

        return {
          ...transaction,
          paymentMethod: paymentMethodValue,
        };
      })
    );

    let filteredTransactions = updatedTransactions;

    if (paymentMethod && paymentMethod.trim()) {
      filteredTransactions = filteredTransactions.filter(
        (transaction) =>
          transaction.paymentMethod &&
          transaction.paymentMethod.toLowerCase() === paymentMethod.toLowerCase()
      );
    }

    return limit > 0
      ? filteredTransactions.slice(skip, skip + limit)
      : filteredTransactions.slice(skip);
  }
};

/* =========================================================
   📊 COUNT FUNCTION
========================================================= */

const countOrdersTransactions = async ({ match = {}, keyword }) => {

  if (!keyword?.trim()) {
    return WebhookEvent.countDocuments(match);
  }

  const regexMatch = buildKeywordMatch(keyword);
  const pipeline = [];

  if (Object.keys(match).length) {
    pipeline.push({ $match: match });
  }

  pipeline.push(
    {
      $lookup: {
        from: "organizations",
        localField: "organization",
        foreignField: "_id",
        as: "organization"
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "companyOrganizer",
        foreignField: "_id",
        as: "companyOrganizer"
      }
    },
    {
      $lookup: {
        from: "users",
        localField: "user",
        foreignField: "_id",
        as: "user"
      }
    },
    {
      $addFields: {
        organization: { $arrayElemAt: ["$organization", 0] },
        companyOrganizer: { $arrayElemAt: ["$companyOrganizer", 0] },
        user: { $arrayElemAt: ["$user", 0] }
      }
    },
    { $match: regexMatch },
    { $count: "total" }
  );

  const res = await WebhookEvent.aggregate(pipeline, { allowDiskUse: true });
  return res[0]?.total || 0;
};

const getOrdersTransactionDetails = async ({ id }) => {
  const transactionDetails = await WebhookEvent.findById(id)
    .populate("organization", "basicInfo")
    .populate("companyOrganizer", "firstName lastName username email profileIcon")
    .populate("user", "firstName lastName username email profileIcon")
    .lean();
  if (!transactionDetails) {
    throw new Error("transaction_not_found");
  }

  let orderData = null;

  if (transactionDetails.orderType && transactionDetails.orderNumber) {
    const modelMap = {
      ticketingbookings: "TicketingOrder",
      menuorders: "MenuOrders",
      userreservations: "UserReservations",
      tickettransfer: "TicketingBookings"
    };

    const modelName = modelMap[transactionDetails.orderType.toLowerCase()];

    if (modelName) {
      try {
        const Model = mongoose.model(modelName);
        if (modelName === 'MenuOrders') {
          try {
            orderData = await Model.findById(transactionDetails.orderNumber)
              .lean();
            for (let i = 0; i < orderData.items.length; i++) {
              const item = orderData.items[i];

              if (item.menuItemSnapShot) {
                const [category, menu, event] = await Promise.all([
                  mongoose.model('MenuItemCategories').findById(item.menuItemSnapShot.category).lean(),
                  mongoose.model('Menus').findById(item.menuItemSnapShot.menu).lean(),
                  mongoose.model('Event').findById(item.menuItemSnapShot.event).lean(),
                ]);

                item.menuItemSnapShot.category = category;
                item.menuItemSnapShot.menu = menu;
                item.menuItemSnapShot.event = event;

              }
            }
          } catch (err) {
            console.error("Error fetching order data:", err);
          }
        }
        else if (modelName === 'TicketingOrder') {
          try {
            orderData = await Model.findById(transactionDetails.orderNumber)
              .populate('event')
              .lean();
          } catch (err) {
            console.error("Error fetching order data:", err);
          }
        }
        else if (modelName === 'TicketingBookings') {
          try {
            orderData = await Model.aggregate([
              { $match: { _id: new mongoose.Types.ObjectId(transactionDetails.orderNumber) } },
              {
                $lookup: {
                  from: 'ticketingorders',
                  localField: 'order',
                  foreignField: '_id',
                  as: 'order'
                }
              },
              { $unwind: { path: '$order', preserveNullAndEmptyArrays: true } },
              {
                $lookup: {
                  from: 'ticketings',
                  localField: 'ticket.ticketId',
                  foreignField: '_id',
                  as: 'ticket.ticketId'
                }
              },
              { $unwind: { path: '$ticket.ticketId', preserveNullAndEmptyArrays: true } },
              {
                $lookup: {
                  from: 'userreservations',
                  localField: 'reservationRef',
                  foreignField: '_id',
                  as: 'reservationRef'
                }
              },
              { $unwind: { path: '$reservationRef', preserveNullAndEmptyArrays: true } },
              {
                $lookup: {
                  from: 'events',
                  localField: 'order.event',
                  foreignField: '_id',
                  as: 'order.event'
                }
              },
              { $unwind: { path: '$order.event', preserveNullAndEmptyArrays: true } },
              { $limit: 1 }
            ]).exec();

            if (!orderData || orderData.length === 0) {
            } else {
              const result = orderData[0];
              for (let i = 0; i < result.transferHistory.length; i++) {
                const transfer = result.transferHistory[i];
                const promises = [];

                if (transfer.fromUser) {
                  const fromUserPromise = mongoose.model('User').findById(transfer.fromUser)
                    .select('firstName lastName username')
                    .lean()
                    .then(fromUser => {
                      result.transferHistory[i].fromUser = fromUser || null;
                    });
                  promises.push(fromUserPromise);
                }

                if (transfer.toUser) {
                  const toUserPromise = mongoose.model('User').findById(transfer.toUser)
                    .select('firstName lastName username')
                    .lean()
                    .then(toUser => {
                      result.transferHistory[i].toUser = toUser || null;
                    });
                  promises.push(toUserPromise);
                }
                await Promise.all(promises);
              }

            }
          } catch (err) {
            console.error("Error fetching order data:", err);
          }
        }
        else {
          orderData = await Model.findById(transactionDetails.orderNumber).lean();
        }
      } catch (err) {
        console.error("Error handling the model:", err);
      }
    }
  }
  const completeData = {
    ...transactionDetails,
    orderData
  };
  const formattedData = formatImages(completeData);
  return {
    ...transactionDetails,
    orderData: formattedData.orderData,
  };
};

module.exports = {
  saveIfNotProcessed,
  getOrdersTransactions,
  countOrdersTransactions,
  getOrdersTransactionDetails
};