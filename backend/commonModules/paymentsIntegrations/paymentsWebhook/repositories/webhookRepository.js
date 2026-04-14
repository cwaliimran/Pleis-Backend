const { extractTime } = require("@utils/responseUtil");
const { formatImages } = require("../formator/formateWebhook");
const { getDateRanges } = require("../utils/transsectionDate.utils");
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
    ticketingbookings: "TicketingOrder",
    menuorders: "MenuOrders",
    userreservations: "UserReservations",
    tickettransfer: "TicketingOrder",
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
        .select("paymentDetails")
        .lean();
      paymentMethod =
        orderData?.paymentDetails?.paymentMethod ||
        orderData?.paymentDetails?.paymentType ||
        orderData?.paymentDetails?.paymentOption ||
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
            paymentMethod: "$order.paymentDetails.paymentMethod",
            paymentType: "$order.paymentDetails.paymentType",
            paymentOption: "$order.paymentDetails.paymentOption",
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
        .select("paymentDetails")
        .lean();

      paymentMethod =
        orderData?.paymentDetails?.paymentMethod ||
        orderData?.paymentDetails?.paymentType ||
        orderData?.paymentDetails?.paymentOption ||
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
  limit = 10,
  globalStatusLevel,
  transfered,
  refunded,
  validationStatus,
  orderType, resStartDate, resEndDate,
  resDate,
  resStartTimeUtc,
  resEndTimeUtc, futureRes, pastRes, prePay,
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
  const pipeline = [];


  // Base match
  if (Object.keys(match).length) {
    pipeline.push({ $match: match });
  }

  // Lookups FIRST (so we can search inside them)
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
        localField: "user",
        foreignField: "_id",
        as: "user"
      }
    },
    {
      $addFields: {
        organization: { $arrayElemAt: ["$organization", 0] },
        user: { $arrayElemAt: ["$user", 0] },
        commission: {
          $round: [{ $multiply: [{ $toDouble: "$amount" }, 0.06] }, 2]
        }
      }
    },
    {
      $lookup: {
        from: "userglobalwallets",
        localField: "user._id",
        foreignField: "user",
        as: "wallet",
      },
    },
    { $unwind: { path: "$wallet", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "globalstatuslevels",
        localField: "wallet.global.level",
        foreignField: "_id",
        as: "level",
      },
    },
    { $unwind: { path: "$level", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "ticketingorders",
        localField: "orderNumber",
        foreignField: "_id",
        as: "ticketingorders"
      }
    },
    { $unwind: { path: "$ticketingorders", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "events",
        localField: "ticketingorders.event",
        foreignField: "_id",
        pipeline: [
          { $project: { name: "$basicInfo.title" } }
        ],
        as: "event"
      }
    },
    { $unwind: { path: "$event", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "ticketingbookings",
        localField: "orderNumber",
        foreignField: "order",
        pipeline: [
          { $project: { type: "$ticket.snapshot.title" } }
        ],
        as: "ticketType"
      }
    },
    { $unwind: { path: "$ticketType", preserveNullAndEmptyArrays: true } }
  );
  // Conditionally add ticketingbookings lookup if 'transfered' is true and 'transferHistory' is not empty
  if (transfered) {


    // Add the lookup for ticketingbookings with transferHistory check
    pipeline.push(
      {
        $lookup: {
          from: "ticketingbookings",
          localField: "orderNumber",
          foreignField: "order",
          pipeline: [
            { $project: { type: "$ticket.snapshot.title", transferHistory: 1 } }, // Include transferHistory for filtering
          ],
          as: "ticketType"
        }
      },
      {
        $unwind: {
          path: "$ticketType",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $match: {
          "ticketType.transferHistory": { $ne: [] } // Ensure that transferHistory is not empty
        }
      }
    );
  }
  if (refunded) {

    // Add the lookup for ticketingbookings with transferHistory check
    pipeline.push(
      {
        $lookup: {
          from: "ticketingorders",
          localField: "orderNumber",
          foreignField: "_id",
          pipeline: [
            { $project: { paymentStatus: "$paymentDetails.paymentStatus" } }, // Include `paymentStatus` for filtering
          ],
          as: "ticketType"
        }
      },
      {
        $unwind: {
          path: "$ticketType",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $match: {
          "ticketType.paymentStatus": "refunded" // Ensure that paymentStatus is refunded
        }
      }
    );
  }
  if (orderType === "userreservations") {
    pipeline.push(
      {
        $lookup: {
          from: "userreservations",
          localField: "orderNumber",
          foreignField: "_id",
          as: "userreservations"
        }
      },
      {
        $unwind: {
          path: "$userreservations",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: "events",
          localField: "userreservations.reservationSnapshot.optionalEventId",
          foreignField: "_id",
          pipeline: [
            { $project: { name: "$basicInfo.title" } }
          ],
          as: "events"
        }
      },
      {
        $unwind: {
          path: "$events",
          preserveNullAndEmptyArrays: true
        }
      }
    );

    // Handle resStartDate and resEndDate
    if (resStartDate) {
      // Convert the start date to UTC and set the time to the start of the day
      const startDate = new Date(resStartDate + "T00:00:00.000Z"); // Ensure UTC by adding 'Z' (UTC) to the date string
      pipeline.push({
        $match: {
          "userreservations.reservationSnapshot.timingSlots.dateTimeSlots.date": {
            $gte: startDate // Use $gte to match records greater than or equal to the start date
          }
        }
      });
    }

    if (resEndDate) {
      // Convert the end date to UTC and set the time to the end of the day
      const endDate = new Date(resEndDate + "T23:59:59.999Z"); // Ensure UTC by adding 'Z' (UTC) to the date string
      pipeline.push({
        $match: {
          "userreservations.reservationSnapshot.timingSlots.dateTimeSlots.date": {
            $lte: endDate // Use $lte to match records less than or equal to the end date
          }
        }
      });
    }
    if (resDate) {
      const startOfDay = new Date(resDate + "T00:00:00.000Z");
      const endOfDay = new Date(resDate + "T23:59:59.999Z");
      pipeline.push({
        $match: {
          "userreservations.reservationSnapshot.timingSlots.dateTimeSlots.date": {
            $gte: startOfDay,
            $lte: endOfDay
          }
        }
      });
    }
    if (resStartTimeUtc) {
      pipeline.push({
        $match: {
          "userreservations.reservationSnapshot.timingSlots.dateTimeSlots.timeSlots.startTime": {
            $gte: resStartTimeUtc // Compare the converted UTC start time
          }
        }
      });
    }
    if (resEndTimeUtc) {
      pipeline.push({
        $match: {
          "userreservations.reservationSnapshot.timingSlots.dateTimeSlots.timeSlots.startTime": {
            $lte: resEndTimeUtc // Compare the converted UTC end time
          }
        }
      });
    }
    if (futureRes) {
      pipeline.push({
        $match: {
          "userreservations.reservationSnapshot.timingSlots.dateTimeSlots.date": {
            $gte: new Date() // Match records with a date greater than or equal to the current date
          }
        }
      });
    }
    if (pastRes) {
      pipeline.push({
        $match: {
          "userreservations.reservationSnapshot.timingSlots.dateTimeSlots.date": {
            $lte: new Date() // Match records with a date less than or equal to the current date
          }
        }
      });
    }
    if (prePay) {
      pipeline.push({
        $match: {
          "userreservations.reservationSnapshot.timingSlots.dateTimeSlots.date": {
            $gte: new Date() // Match records with a date greater than or equal to the current date
          },
          "paymentStatus": "paid"
        }
      });
    }
    if (ticketRequiredRes) {
      pipeline.push({
        $match: {
          "userreservations.reservationSnapshot.optionalEventId": {
            $ne: null
          },
        }
      });
    }
    if (cancelledRes) {
      pipeline.push({
        $match: {
          "userreservations.status": "cancelled"
        }
      });
    }
    if (noShowRes) {
      pipeline.push({
        $match: {
          "userreservations.reservationSnapshot.timingSlots.enabled": false, // Match false values for enabled
        }
      });
    }
  }

  if (validationStatus === "scanned") {
    pipeline.push(
      {
        $lookup: {
          from: "ticketingbookings",
          localField: "orderNumber",
          foreignField: "order",
          pipeline: [
            { $project: { type: "$ticket.snapshot.title", checkInHistory: 1 } }, // Include checkInHistory   for filtering
          ],
          as: "ticketType"
        }
      },
      {
        $unwind: {
          path: "$ticketType",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $match: {
          "ticketType.checkInHistory": { $ne: [] } // Ensure that checkInHistory is not empty
        }
      }
    );
  }
  if (validationStatus === "not-scanned") {

    // Add the lookup for ticketingbookings with checkInHistory check
    pipeline.push(
      {
        $lookup: {
          from: "ticketingbookings",
          localField: "orderNumber",
          foreignField: "order",
          pipeline: [
            { $project: { type: "$ticket.snapshot.title", checkInHistory: 1 } }, // Include checkInHistory   for filtering
          ],
          as: "ticketType"
        }
      },
      {
        $unwind: {
          path: "$ticketType",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $match: {
          "ticketType.checkInHistory": { $eq: [] } // Ensure that checkInHistory is empty
        }
      }
    );
  }
  // 🔥 KEYWORD FILTER (MAIN ADDITION)

  if (globalStatusLevel && globalStatusLevel.trim()) {
    pipeline.push({
      $match: {
        "level.title": globalStatusLevel
      }
    });
  }

  if (orderType === "menuorders") {
    pipeline.push(
      // Step 1: Lookup menuorders based on orderNumber
      {
        $lookup: {
          from: "menuorders",
          localField: "orderNumber",
          foreignField: "_id",
          as: "menuorders"
        }
      },
      {
        $unwind: {
          path: "$menuorders",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: "userreservations",
          localField: "menuorders.reservation",
          foreignField: "_id",
          as: "menuorders.UserReservation"
        }
      },
      {
        $unwind: {
          path: "$menuorders.UserReservation",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $lookup: {
          from: "users",
          localField: "menuorders.updateHistory.updatedBy",
          foreignField: "_id",
          pipeline: [
            { $project: { username: 1, firstName: 1, lastName: 1, email: 1, accountState: { userType: 1 } } }
          ],
          as: "updatedBy"
        }
      },
      {
        $unwind: {
          path: "$updatedBy",
          preserveNullAndEmptyArrays: true
        }
      },
      // Add the lookup on users inside the updateHistory array
      {
        $addFields: {
          "menuorders.updateHistory": {
            $map: {
              input: {
                $cond: {
                  if: { $isArray: "$menuorders.updateHistory" },  // Check if it's already an array
                  then: "$menuorders.updateHistory",
                  else: [{ // Convert single object to an array
                    updatedAt: "$menuorders.updateHistory.updatedAt",
                    updatedBy: "$menuorders.updateHistory.updatedBy",
                    updateData: "$menuorders.updateHistory.updateData"
                  }]
                }
              },
              as: "history",
              in: {
                $mergeObjects: [
                  "$$history",  // Original updateHistory object
                  {
                    updatedBy: {
                      $arrayElemAt: [
                        {
                          $filter: {
                            input: {
                              $cond: {
                                if: { $isArray: "$updatedBy" },  // Ensure updatedBy is treated as an array
                                then: "$updatedBy",
                                else: ["$updatedBy"]  // Wrap in array if it's not an array
                              }
                            },
                            as: "user",
                            cond: { $eq: ["$$user._id", "$$history.updatedBy"] }
                          }
                        },
                        0
                      ]
                    }
                  }
                ]
              }
            }
          }
        }
      }
    );
    if (orderStatus) {
      pipeline.push({
        $match: {
          "menuorders.status": orderStatus
        }
      });
    }
    if (deliveryMethod) {
      pipeline.push({
        $match: {
          "menuorders.pickupType": deliveryMethod
        }
      });
    }
    if (category) {
      pipeline.push({
        $match: {
          "menuorders.items.menuItemSnapShot.category": category
        }
      });
    }
    if (menuSaleItme) {
      pipeline.push({
        $match: {
          "menuorders.priceBreakdown.saleDiscount": { $gt: 0 }
        }
      });
    }
    if (promotionOrders === "true") {
      pipeline.push({
        $match: {
          "menuorders.priceBreakdown.promoDiscount": { $gt: 0 }
        }
      });
    }
    if (promotionOrders === "false") {
      pipeline.push({
        $match: {
          "menuorders.priceBreakdown.promoDiscount": { $lte: 0 }
        }
      });
    }
    if (eventBasedOrder) {
      pipeline.push({
        $match: {
          "menuorders.items.menuItemSnapShot.event": { $ne: null }
        }
      });
    }
    if (resDate) {
      const startOfDay = new Date(resDate + "T00:00:00.000Z");
      const endOfDay = new Date(resDate + "T23:59:59.999Z");
      pipeline.push({
        $match: {
          "menuorders.UserReservation.reservationSnapshot.timingSlots.dateTimeSlots.date": {
            $gte: startOfDay,
            $lte: endOfDay
          }
        }
      });
    }
  }
  // Sorting
  pipeline.push({ $sort: { createdAt: -1, _id: -1 } });
  if (keyword && keyword.trim()) {
    const regex = new RegExp(keyword, "i");

    pipeline.push({
      $match: {
        $or: [
          { orderNumber: regex },
          { transactionId: regex },
          { amount: { $regex: keyword, $options: "i" } }, // if string
          { "user.firstName": { $regex: regex } },
          { "user.lastName": { $regex: regex } },
          { "user.username": { $regex: regex } },
          { "user.email": { $regex: regex } },
          { "organization.basicInfo.name": { $regex: regex } },
          { "userreservations.reservationSnapshot.reservationType": { $regex: regex } },
          { "event.name": { $regex: regex } },
          { "ticketType.type": { $regex: regex } },

          {
            "menuorders.items.menuItemSnapShot.title": {
              $regex: regex
            }
          }, // Added for searching by menu item title

          // Full name search (firstName + lastName) using $concat for the 'updatedBy' field
          {
            $or: [
              {
                $expr: {
                  $regexMatch: {
                    input: { $concat: ["$updatedBy.firstName", " ", "$updatedBy.lastName"] }, // Check for full name in updatedBy
                    regex: regex
                  }
                }
              }
            ]
          }
        ]
      }
    });
  }
  // Projection
  pipeline.push({
    $project: {
      provider: 1,
      commission: 1,
      orderType: 1,
      orderNumber: 1,
      paymentStatus: 1,
      transactionId: 1,
      ticketType: 1,
      events: 1,
      userreservations: 1,
      menuorders: 1,
      amount: 1,
      payload: 1,
      createdAt: 1,
      event: 1,
      updatedAt: 1,
      userGlobal: {
        level: {
          _id: "$level._id",
          title: "$level.title",
          type: "$level.type",
        },
      },

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
  });

  // Pagination
  if (skip) pipeline.push({ $skip: skip });
  if (limit) pipeline.push({ $limit: limit });

  // Execute
  const transactions = await WebhookEvent.aggregate(pipeline, { allowDiskUse: true });

  // Attach payment method
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

  // Filter by paymentMethod (post-process)
  let filteredTransactions = updatedTransactions;

  if (paymentMethod && paymentMethod.trim()) {
    filteredTransactions = filteredTransactions.filter(
      (transaction) =>
        transaction.paymentMethod &&
        transaction.paymentMethod.toLowerCase() === paymentMethod.toLowerCase()
    );
  }

  return filteredTransactions;
};

/* =========================================================
   📊 COUNT FUNCTION
========================================================= */

const countOrdersTransactions = async ({
  match = {},
  keyword,
  paymentMethod,
  globalStatusLevel,
  transfered,
  refunded,
  validationStatus
}) => {
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
        user: { $arrayElemAt: ["$user", 0] }
      }
    },
    {
      $lookup: {
        from: "userglobalwallets",
        localField: "user._id",
        foreignField: "user",
        as: "wallet"
      }
    },
    { $unwind: { path: "$wallet", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "globalstatuslevels",
        localField: "wallet.global.level",
        foreignField: "_id",
        as: "level"
      }
    },
    { $unwind: { path: "$level", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "ticketingorders",
        localField: "orderNumber",
        foreignField: "_id",
        as: "ticketingorders"
      }
    },
    { $unwind: { path: "$ticketingorders", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "events",
        localField: "ticketingorders.event",
        foreignField: "_id",
        pipeline: [
          { $project: { name: "$basicInfo.title" } }
        ],
        as: "event"
      }
    },
    { $unwind: { path: "$event", preserveNullAndEmptyArrays: true } },
    {
      $lookup: {
        from: "ticketingbookings",
        localField: "orderNumber",
        foreignField: "order",
        pipeline: [
          { $project: { type: "$ticket.snapshot.title" } }
        ],
        as: "ticketType"
      }
    },
    { $unwind: { path: "$ticketType", preserveNullAndEmptyArrays: true } }
  );

  // Conditionally add ticketingbookings lookup if 'transfered' is true and 'transferHistory' is not empty
  if (transfered) {
    pipeline.push(
      {
        $lookup: {
          from: "ticketingbookings",
          localField: "orderNumber",
          foreignField: "order",
          pipeline: [
            { $match: { "transferHistory": { $ne: [] } } },  // Ensure transferHistory is not empty
            { $project: { type: "$ticket.snapshot.title" } }
          ],
          as: "ticketType"
        }
      },
      { $unwind: { path: "$ticketType", preserveNullAndEmptyArrays: true } }
    );
  }

  // Conditionally add ticketingbookings lookup if 'refunded' is true and paymentStatus is 'refunded'
  if (refunded) {
    pipeline.push(
      {
        $lookup: {
          from: "ticketingorders",
          localField: "orderNumber",
          foreignField: "_id",
          pipeline: [
            { $project: { paymentStatus: "$paymentDetails.paymentStatus" } }
          ],
          as: "ticketType"
        }
      },
      { $unwind: { path: "$ticketType", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          "ticketType.paymentStatus": "refunded"  // Ensure that paymentStatus is refunded
        }
      }
    );
  }

  // Conditionally filter by validation status 'scanned' - check if checkInHistory is not empty
  if (validationStatus === "scanned") {
    pipeline.push(
      {
        $lookup: {
          from: "ticketingbookings",
          localField: "orderNumber",
          foreignField: "order",
          pipeline: [
            { $project: { type: "$ticket.snapshot.title", checkInHistory: 1 } }
          ],
          as: "ticketType"
        }
      },
      { $unwind: { path: "$ticketType", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          "ticketType.checkInHistory": { $ne: [] }  // Ensure checkInHistory is not empty
        }
      }
    );
  }

  // Conditionally filter by validation status 'not-scanned' - check if checkInHistory is empty
  if (validationStatus === "not-scanned") {
    pipeline.push(
      {
        $lookup: {
          from: "ticketingbookings",
          localField: "orderNumber",
          foreignField: "order",
          pipeline: [
            { $project: { type: "$ticket.snapshot.title", checkInHistory: 1 } }
          ],
          as: "ticketType"
        }
      },
      { $unwind: { path: "$ticketType", preserveNullAndEmptyArrays: true } },
      {
        $match: {
          "ticketType.checkInHistory": { $eq: [] }  // Ensure checkInHistory is empty
        }
      }
    );
  }

  if (keyword && keyword.trim()) {
    const regex = new RegExp(keyword, "i");

    pipeline.push({
      $match: {
        $or: [
          { orderNumber: regex },
          { transactionId: regex },
          { amount: { $regex: keyword, $options: "i" } }, // if string
          { "user.firstName": { $regex: regex } },
          { "user.lastName": { $regex: regex } },
          { "user.username": { $regex: regex } },
          { "user.email": { $regex: regex } },
          { "organization.basicInfo.name": { $regex: regex } },
          { "event.name": { $regex: regex } },
          { "ticketType.type": { $regex: regex } },
          // Full name search (firstName + lastName) using $concat outside $expr
          {
            $or: [
              {
                $expr: {
                  $regexMatch: {
                    input: { $concat: ["$user.firstName", " ", "$user.lastName"] },
                    regex: regex
                  }
                }
              }
            ]
          }
        ]
      }
    });
  }

  // Filter by globalStatusLevel
  if (globalStatusLevel && globalStatusLevel.trim()) {
    pipeline.push({
      $match: {
        "level.title": globalStatusLevel
      }
    });
  }
  pipeline.push({ $count: "total" });







  const res = await WebhookEvent.aggregate(pipeline, { allowDiskUse: true });

  return res[0]?.total || 0;
};



const getOrdersTransactionDetails = async ({ id }) => {
  const [status, transactionDetails] = await Promise.all([

    // 🔥 Aggregation (status)
    WebhookEvent.aggregate([
      {
        $match: {
          _id: new mongoose.Types.ObjectId(id),
        },
      },

      {
        $lookup: {
          from: "users",
          localField: "user",
          foreignField: "_id",
          as: "user",
        },
      },
      { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "userglobalwallets",
          localField: "user._id",
          foreignField: "user",
          as: "wallet",
        },
      },
      { $unwind: { path: "$wallet", preserveNullAndEmptyArrays: true } },

      {
        $lookup: {
          from: "globalstatuslevels",
          localField: "wallet.global.level",
          foreignField: "_id",
          as: "level",
        },
      },
      { $unwind: { path: "$level", preserveNullAndEmptyArrays: true } },

      {
        $project: {
          userGlobal: {
            points: "$wallet.global.points",
            lifetimePoints: "$wallet.global.lifetimePoints",
            level: {
              _id: "$level._id",
              title: "$level.title",
              type: "$level.type",
            },
          },
        },
      },
    ]),

    // 🔥 Main transaction query
    WebhookEvent.findById(id)
      .populate("organization", "basicInfo")
      .populate("companyOrganizer", "firstName lastName username email profileIcon")
      .populate("user", "firstName lastName username email profileIcon")
      .lean()

  ]);

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
    userGlobal: status[0]?.userGlobal?.level || "no level",
    orderData: formattedData.orderData,
  };
};










const TRANSACTION_SERVICE_FEE = 2.5;  // Example constant service fee

const getCount = async (Model, baseMatch, extra, range) => {
  const finalMatch = {
    ...baseMatch,
    ...extra,
    ...(range && { createdAt: range }),  // Apply date range if provided
  };
  return Model.countDocuments(finalMatch);
};

const getTotalAmount = async (Model, baseMatch, extra, range) => {
  const finalMatch = { ...baseMatch, ...extra, ...(range && { createdAt: range }) };
  const result = await Model.aggregate([
    { $match: finalMatch },
    { $group: { _id: null, totalAmount: { $sum: { $toDouble: "$amount" } } } },
  ]);
  return result[0] ? result[0].totalAmount : 0;
};

// Helper function to get the total commission (6% of amount)
const getTotalCommission = async (Model, baseMatch, extra, range) => {
  const finalMatch = { ...baseMatch, ...extra, ...(range && { createdAt: range }) };
  const result = await Model.aggregate([
    { $match: finalMatch },
    { $group: { _id: null, totalCommission: { $sum: { $multiply: [{ $toDouble: "$amount" }, 0.06] } } } },
  ]);
  return result[0] ? result[0].totalCommission : 0;
};

const getUniqueUsers = async (Model, baseMatch, extra, range) => {
  const finalMatch = { ...baseMatch, ...extra, ...(range && { createdAt: range }) };
  const result = await Model.aggregate([
    { $match: finalMatch },
    { $group: { _id: "$user" } },  // Group by user ID to get unique users
    { $count: "uniqueUsers" },  // Count the unique users
  ]);
  return result[0] ? result[0].uniqueUsers : 0;
};

const getTransactionStats = async ({ dateFilter, timezone, companyOrganizer, organizations = [] }) => {
  const ranges = getDateRanges({ dateFilter, timezone });


  if (organizations.length === 0) {
    organizations = undefined
  }

  // Base match for aggregation
  const baseMatch = {
    ...companyOrganizer && { companyOrganizer: new mongoose.Types.ObjectId(companyOrganizer) },
    ...organizations && { organization: { $in: organizations } },
  };

  // =========================
  // CURRENT PERIOD STATS
  // =========================
  const currentStats = {
    totalTransactionsCurrent: await getCount(WebhookEvent, baseMatch, {}, ranges && { $gte: ranges.start, $lt: ranges.end }),
    totalAmountCurrent: await getTotalAmount(WebhookEvent, baseMatch, { amount: { $ne: 0 } }, ranges && { $gte: ranges.start, $lt: ranges.end }),
    totalCommissionCurrent: await getTotalCommission(WebhookEvent, baseMatch, { amount: { $ne: 0 } }, ranges && { $gte: ranges.start, $lt: ranges.end }),
    totalUsersCurrent: await getUniqueUsers(WebhookEvent, baseMatch, {}, ranges && { $gte: ranges.start, $lt: ranges.end }),
  };
  const totalAmountCurrent = currentStats.totalAmountCurrent; // Explicitly define this variable
  const totalCommissionCurrent = currentStats.totalCommissionCurrent; // Explicitly define this variable

  currentStats.totalOrganizerPayoutCurrent = parseFloat((
    (totalAmountCurrent || 0) - (totalCommissionCurrent || 0)
  ).toFixed(2));

  // =========================
  // PREVIOUS PERIOD STATS
  // =========================
  const previousStats = {
    totalTransactionsPrevious: ranges
      ? await getCount(WebhookEvent, baseMatch, {}, { $gte: ranges.prevStart, $lt: ranges.prevEnd })
      : 0,
    totalAmountPrevious: ranges
      ? await getTotalAmount(WebhookEvent, baseMatch, { amount: { $ne: 0 } }, { $gte: ranges.prevStart, $lt: ranges.prevEnd })
      : 0,
    totalCommissionPrevious: ranges
      ? await getTotalCommission(WebhookEvent, baseMatch, { amount: { $ne: 0 } }, { $gte: ranges.prevStart, $lt: ranges.prevEnd })
      : 0,
    totalUsersPrevious: ranges
      ? await getUniqueUsers(WebhookEvent, baseMatch, {}, { $gte: ranges.prevStart, $lt: ranges.prevEnd })
      : 0,
  };
  const totalAmountPrevious = previousStats.totalAmountPrevious;
  const totalCommissionPrevious = previousStats.totalCommissionPrevious;

  previousStats.totalOrganizerPayoutPrevious = parseFloat((
    (totalAmountPrevious || 0) - (totalCommissionPrevious || 0)
  ).toFixed(2));

  // =========================
  // DERIVED METRICS
  // =========================
  const currentTransactionStats = {
    totalTransactionsCurrent: parseInt(currentStats.totalTransactionsCurrent || 0, 10),
    totalAmountCurrent: parseFloat((currentStats.totalAmountCurrent || 0).toFixed(2)),
    totalCommissionCurrent: parseFloat((currentStats.totalCommissionCurrent || 0).toFixed(2)),
    serviceFeeCurrent: parseFloat((currentStats.totalCommissionCurrent || 0).toFixed(2)),
    organizerPayoutCurrent: parseFloat(
      (currentStats.totalAmountCurrent - currentStats.totalCommissionCurrent - TRANSACTION_SERVICE_FEE).toFixed(2)
    ),
    totalUsersCurrent: parseInt(currentStats.totalUsersCurrent || 0, 10),
    totalOrganizerPayoutCurrent: parseFloat(currentStats.totalOrganizerPayoutCurrent.toFixed(2)),
  };

  const previousTransactionStats = {
    totalTransactionsPrevious: parseInt(previousStats.totalTransactionsPrevious || 0, 10),
    totalAmountPrevious: parseFloat((previousStats.totalAmountPrevious || 0).toFixed(2)),
    totalCommissionPrevious: parseFloat((previousStats.totalCommissionPrevious || 0).toFixed(2)),
    serviceFeePrevious: parseFloat((previousStats.totalCommissionPrevious || 0).toFixed(2)),
    organizerPayoutPrevious: parseFloat(
      (previousStats.totalAmountPrevious - previousStats.totalCommissionPrevious - TRANSACTION_SERVICE_FEE).toFixed(2)
    ),
    totalUsersPrevious: parseInt(previousStats.totalUsersPrevious || 0, 10),
    totalOrganizerPayoutPrevious: parseFloat(previousStats.totalOrganizerPayoutPrevious.toFixed(2)),

  };

  // =========================
  // FINAL RESPONSE
  // =========================
  return {
    ...currentTransactionStats,
    ...previousTransactionStats,
  };
};




module.exports = {
  saveIfNotProcessed,
  getOrdersTransactions,
  countOrdersTransactions,
  getOrdersTransactionDetails,
  getTransactionStats
};