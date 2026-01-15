// repositories/ReservationRepository.js
const Reservations = require("@ReservationsModel");
const { UserReservations } = require("@UserReservationsModel");
const mongoose = require("mongoose");

const {
  generateMeta,
  convertToUtcDateOnly,
  getCurrentDateInTimezone,
} = require("../../helperUtils/responseUtil");
const createReservation = async (data) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    data.amount = 0;
    const userReservation = new UserReservations(data);
    await userReservation.save({ session });

    await session.commitTransaction();
    session.endSession();

    return userReservation;

  } catch (err) {
    await session.abortTransaction();
    session.endSession();
    throw err;
  }
};
//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return UserReservations.findByIdAndUpdate(id, data, { new: true });
};

const getUserBookingsByDate = async ({ date, status }) => {
  const utcDate = convertToUtcDateOnly(date, "UTC");

  const start = new Date(utcDate);
  const end = new Date(utcDate);
  end.setUTCDate(end.getUTCDate() + 1);

  const pipeline = [
    {
      $match: {
        // status,
        "timingSlots.dateTimeSlots.date": {
          $gte: start,
          $lt: end,
        },
      },
    },

    // 🔹 Organization (selective fields only)
    {
      $lookup: {
        from: "organizations",
        let: { orgId: "$organizationId" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$orgId"] } } },
          {
            $project: {
              _id: 1,
              "basicInfo.name": 1,
              "basicInfo.media.logo": 1,
            },
          },
        ],
        as: "organization",
      },
    },
    {
      $unwind: {
        path: "$organization",
        preserveNullAndEmptyArrays: true,
      },
    },

    // 🔹 Organizer (selective fields only)
    {
      $lookup: {
        from: "users",
        let: { organizerId: "$companyOrganizer" },
        pipeline: [
          { $match: { $expr: { $eq: ["$_id", "$$organizerId"] } } },
          {
            $project: {
              _id: 1,
              firstName: 1,
              lastName: 1,
            },
          },
        ],
        as: "organizer",
      },
    },
    {
      $unwind: {
        path: "$organizer",
        preserveNullAndEmptyArrays: true,
      },
    },

    // ✅ Keep full UserReservations, just append derived fields
    {
      $addFields: {
        organizationTitle: "$organization.basicInfo.name",
        organizationLogo: "$organization.basicInfo.media.logo",
        organizerName: {
          $cond: [
            { $ifNull: ["$organizer", false] },
            { $concat: ["$organizer.firstName", " ", "$organizer.lastName"] },
            null,
          ],
        },
      },
    },

    // Optional cleanup
    {
      $unset: ["organization", "organizer"],
    },

    { $sort: { createdAt: -1 } },
  ];

  return UserReservations.aggregate(pipeline);
};

module.exports = {
  createReservation,
  findByIdAndUpdate,
  getUserBookingsByDate
};