

const Organizations = require("@OrganizationModel");
const mongoose = require("mongoose");
const moment = require("moment-timezone");
const { OrganizationStaffAttendance } = require(
  "@OrganizationStaffAttendanceModel"
);

const getOrganizationsAsStaff = async (userId) => {
  userId = userId?.userId || userId;
  userId = new mongoose.Types.ObjectId(userId);

  const organizations = await Organizations.aggregate([
    {
      $match: {
        $or: [
          { creator: userId },
          { "staff.user": userId },
        ],
      },
    },

    // 🔹 Get current venue (ONLY title + location)
    {
      $lookup: {
        from: "venues",
        let: { orgId: "$_id" },
        pipeline: [
          {
            $match: {
              $expr: {
                $and: [
                  { $eq: ["$organization", "$$orgId"] },
                  { $eq: ["$status", "active"] },
                  { $eq: ["$isPrimary", true] },
                ],
              },
            },
          },
          { $sort: { isPrimary: -1, createdAt: -1 } },
          { $limit: 1 },

          // ✅ Only select what you need
          {
            $project: {
              _id: 0,          // optional
              title: 1,
              "location.fullAddress": 1,
            },
          },
        ],
        as: "currentVenue",
      },
    },

    // 🔹 Flatten venue array
    {
      $addFields: {
        currentVenue: { $arrayElemAt: ["$currentVenue", 0] },
      },
    },

    // 🔹 Filter staff if user is not creator
    {
      $addFields: {
        staff: {
          $cond: [
            { $eq: ["$creator", userId] },
            "$staff",
            {
              $filter: {
                input: "$staff",
                as: "s",
                cond: { $eq: ["$$s.user", userId] },
              },
            },
          ],
        },
      },
    },

    {
      $project: {
        basicInfo: 1,
        staff: 1,
        creator: 1,
        currentVenue: 1,
      },
    },
  ]);

  return organizations;
};



// -----------------------------
// CHECK-IN
// -----------------------------
const checkInToOrganization = async ({
  organizationId,
  staffId,
  source = "manual",
  timezone = "UTC"
}) => {
  const orgId = new mongoose.Types.ObjectId(organizationId);
  const userId = new mongoose.Types.ObjectId(staffId);

  // 🔒 Validate staff assignment
  const exists = await Organizations.exists({
    _id: orgId,
    $or: [{ creator: userId }, { "staff.user": userId }]
  });

  if (!exists) {
    throw new Error("staff_not_assigned_to_organization");
  }

  const attendanceDate = moment()
    .tz(timezone)
    .format("YYYY-MM-DD");

  // ⛔ Prevent double check-in
  const alreadyCheckedIn = await OrganizationStaffAttendance.exists({
    organization: orgId,
    staff: userId,
    attendanceDate,
    status: "checkedIn"
  });

  if (alreadyCheckedIn) return true;

  await OrganizationStaffAttendance.updateOne(
    {
      organization: orgId,
      staff: userId,
      attendanceDate
    },
    {
      $set: { status: "checkedIn" },
      $push: {
        history: {
          type: "checkIn",
          at: new Date(),
          source
        }
      }
    },
    { upsert: true }
  );

  return true;
};

// -----------------------------
// CHECK-OUT
// -----------------------------
const checkOutFromOrganization = async ({
  organizationId,
  staffId,
  timezone = "UTC",
  source = "manual"
}) => {
  const orgId = new mongoose.Types.ObjectId(organizationId);
  const userId = new mongoose.Types.ObjectId(staffId);

  const now = new Date();

  const today = moment(now)
    .tz(timezone)
    .format("YYYY-MM-DD");

  const result = await OrganizationStaffAttendance.updateMany(
    {
      organization: orgId,
      staff: userId,
      status: "checkedIn",
      attendanceDate: { $lte: today }
    },
    {
      $set: {
        status: "checkedOut"
      },
      $push: {
        history: {
          type: "checkOut",
          at: now,
          source
        }
      }
    }
  );

  return {
    success: true,
    checkedOutDays: result.modifiedCount
  };
};


// get checked-in staff IDs for organization (plain string IDs)
const getCheckedInStaffForOrganization = async (organizationId, timezone = "UTC") => {
  const orgId = new mongoose.Types.ObjectId(organizationId);

  /* 
  commented out to allow checking all-time checked-in staff may a staff checked in on a previous date and hasn't checked out yet
  */
  // const today = moment()
  //   .tz(timezone)
  //   .format("YYYY-MM-DD");

  const staffIds = await OrganizationStaffAttendance.distinct("staff", {
    organization: orgId,
    // attendanceDate: today,
    status: "checkedIn"
  });

  // convert ObjectId → string
  return staffIds.map(id => id.toString());
};


module.exports = {
  getOrganizationsAsStaff,
  checkInToOrganization,
  checkOutFromOrganization,
  getCheckedInStaffForOrganization

};
