const mongoose = require("mongoose");
const ApplyPointsByStaff = require("@ApplyPointsByStaffModel");
const { calculatePointsRepo } = require("../../app/loyalty/calculatePointsEarning/pointsEarningsRepository");
const { createTransaction } = require("../../app/userWalletService/transactions/services/unifiedTransactionsService");
const menuItemRepo = require("../../admin/menuManagement/menuItems/menuItemsRepository");
const { sendResponse } = require("../../helperUtils/responseUtil");
const { sendUserNotifications } = require("../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");

const applyPoints = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      user,
      companyOrganizer,
      organization,
      items = [],
      notes = ""
    } = req.body;

    if (!items || !items.length) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "items_required"
      });
    }

    // 1️⃣ Fetch menu items (for snapshot + price)
    const itemIds = items.map(i => new mongoose.Types.ObjectId(i.menuItem));

    const menuItems = await menuItemRepo.getMenuItemsWithFilters(
      { _id: { $in: itemIds } }
    );

    if (!menuItems.length) {
      throw new Error("invalid_items");
    }

    let totalPrice = 0;

    const storedItems = items.map(i => {
      const menuItem = menuItems.find(m => m._id.toString() === i.menuItem);
      if (!menuItem) throw new Error(`Invalid menu item: ${i.menuItem}`);

      const price = menuItem.discountPrice || menuItem.basePrice;
      const finalPrice = price * i.quantity;

      totalPrice += finalPrice;

      return {
        menuItem: menuItem._id,
        quantity: i.quantity,
        finalPrice,
        menuItemSnapShot: JSON.parse(JSON.stringify(menuItem)),
      };
    });

    // 2️⃣ Create record FIRST (inside session)
    const applyRecord = await ApplyPointsByStaff.create(
      [
        {
          organization,
          user,
          items: storedItems,
          totalPrice,
          notes,
          creator: req.user._id
        }
      ],
      { session }
    ).then(r => r[0]);

    // 3️⃣ Calculate loyalty points
    const pointsCalculation =
      await calculatePointsRepo(user, companyOrganizer, totalPrice);

    // 4️⃣ Create wallet transaction
    const trx = await createTransaction(
      {
        user,
        companyOrganizer,
        organization,
        companyPoints: {
          base: pointsCalculation.organizer.earnedPoints,
          multiplier: 1,
          total: pointsCalculation.organizer.earnedPoints,
          pointsPerEuro: pointsCalculation.organizer.pointsPerEuro,
        },
        globalPoints: {
          base: pointsCalculation.global.earnedPoints,
          multiplier: 1,
          total: pointsCalculation.global.earnedPoints,
          pointsPerEuro: pointsCalculation.global.pointsPerEuro,
        },
        allowNegative: false,
        type: "earn",
        description: "Points applied manually by staff",
        entityId: applyRecord._id,
        domainType: "applypointsbystaffs"
      },
      session
    );

    if (!trx.success) {
      throw new Error(trx.message || "transaction_failed");
    }

    await session.commitTransaction();
    session.endSession();
    await sendUserNotifications({
      recipientIds: [user.toString()],
      title: "Points Applied",
      body: `You earn ${trx.companyPoints.total + trx.globalPoints.total} points.`,
      data: {
        type: NotificationTypes.POINTS_UPDATE,
        objectType: "group",
      },
      image: "noimage",
      sender: companyOrganizer,
      objectId: applyRecord._id,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "points_applied_successfully",
      data: {
        applyRecord,
        transaction: trx
      }
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();

    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};


const calculatePoints = async (req, res) => {
  try {
    const {
      user,
      companyOrganizer,
      totalSpending
    } = req.body;

    const pointsEarnings = await calculatePointsRepo(
      user,
      companyOrganizer,
      totalSpending
    );

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "points_calculated_successfully",
      data: pointsEarnings,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
}


module.exports = { applyPoints, calculatePoints };
