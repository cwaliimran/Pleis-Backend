const mongoose = require("mongoose");
const ApplyPointsByStaff = require("@ApplyPointsByStaffModel");
const { calculatePointsRepo } = require("../../app/loyalty/calculatePointsEarning/pointsEarningsRepository");
const { createTransactionService } = require("../../app/userWalletService/transactions/services/unifiedTransactionsService");
const menuItemRepo = require("../../admin/menuManagement/menuItems/menuItemsRepository");
const { sendResponse } = require("../../helperUtils/responseUtil");
const { sendUserNotifications } = require("../../controllers/communicationController");
const { NotificationTypes } = require("@NotificationsModel");
const { getUserCompanyWallet } = require("../../app/loyalty/clubMembers/clubMembersService");
const { handleLoyaltyEarningConsequences } = require("../../commonModules/paymentsIntegrations/dummyChargeForTesting/orderFinalizers/handleLoyaltyEarningConsequences");

const applyPoints = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  let committed = false;

  try {
    const {
      user,
      companyOrganizer,
      organization,
      items = [],
      notes = ""
    } = req.body;

    if (!items.length) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "items_required"
      });
    }

    /* ---------- FETCH MENU ITEMS ---------- */
    const itemIds = items.map(i => new mongoose.Types.ObjectId(i.menuItem));

    const menuItems = await menuItemRepo.getMenuItemsWithFilters({
      _id: { $in: itemIds }
    });

    if (!menuItems.length) {
      throw new Error("invalid_items");
    }

    /* ---------- BUILD ORDER ITEMS ---------- */
    let totalPrice = 0;

    const storedItems = items.map(i => {
      const menuItem = menuItems.find(
        m => m._id.toString() === i.menuItem
      );

      if (!menuItem) {
        throw new Error(`Invalid menu item: ${i.menuItem}`);
      }

      const price = menuItem.basePrice || 0; // fallback to 0 if basePrice is missing
      const finalPrice = price * i.quantity;

      totalPrice += finalPrice;


      return {
        menuItem: menuItem._id,
        quantity: i.quantity,
        finalPrice,
        menuItemSnapShot: menuItem.toObject(), // safer snapshot
      };
    });

    /* ---------- CREATE APPLY RECORD ---------- */
    const applyRecord = await ApplyPointsByStaff.create(
      [{
        organization,
        user,
        items: storedItems,
        totalPrice,
        notes,
        creator: req.user._id
      }],
      { session }
    ).then(r => r[0]);

    /* ---------- CALCULATE POINTS ---------- */
    const pointsCalculation =
      await calculatePointsRepo(user, companyOrganizer, totalPrice);


    let companyPoints = {
      base: pointsCalculation.organizer.earnedPoints,
      multiplier: pointsCalculation.organizer.organizerMultiplier || 1,
      total: pointsCalculation.organizer.earnedPoints,
      pointsPerEuro: pointsCalculation.organizer.pointsPerEuro,
    }

    let globalPoints = {
      base: pointsCalculation.global.earnedPoints,
      multiplier: pointsCalculation.global.globalMultiplier || 1,
      total: pointsCalculation.global.earnedPoints,
      pointsPerEuro: pointsCalculation.global.pointsPerEuro,
    }

    /* ---------- CREATE WALLET TRANSACTION ---------- */
    const trx = await createTransactionService(
      {
        user,
        companyOrganizer,
        organization,
        companyPoints,
        globalPoints,
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

    /* ---------- COMMIT ---------- */
    await session.commitTransaction();
    committed = true;
    session.endSession();


    handleLoyaltyEarningConsequences({
      userId: user,
      companyOrganizer: companyOrganizer,
      companyPoints: companyPoints,
      globalPoints: globalPoints,
      menuOrder: menuItems
    });


    /* ---------- SEND NOTIFICATION (OUTSIDE TX) ---------- */
    sendUserNotifications({
      recipientIds: [user.toString()],
      title: "Points Applied",
      body: `You earn ${pointsCalculation.organizer.earnedPoints} company points and ${pointsCalculation.global.earnedPoints} global points.`,
      data: {
        type: NotificationTypes.POINTS_UPDATE,
        objectType: "ApplyPointsByStaff",
      },
      image: "noimage",
      sender: companyOrganizer,
      objectId: applyRecord._id,
    }).catch(err =>
      console.error("Notification failed:", err.message)
    );



    let companyWallet = await getUserCompanyWallet(user, companyOrganizer)
    /* ---------- RESPONSE ---------- */
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "points_applied_successfully",
      data: {
        applyRecord,
        transaction: trx,
        companyWallet
      }
    });

  } catch (error) {
    if (!committed) {
      await session.abortTransaction();
    }

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
