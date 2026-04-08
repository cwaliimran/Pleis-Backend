// repositories/organizationRepository.js
const Venues = require("@VenuesModel");
const Organizations = require("@OrganizationModel");

const { getModelCounts } = require("@dbUtils/queryUtil");
const { User } = require("../../models/UserModel");
const mongoose = require("mongoose");

// Create
const createOrganization = async (data) => {
  const organization = new Organizations(data);
  return await organization.save();
};

// Get all with filters
const getOrganizationsWithFilters = async (query, skip, limit) => {
  const matchQuery = { ...query };

  // Set the match query for companyOrganizer if provided
  if (query.companyOrganizer) {
    matchQuery.creator = new mongoose.Types.ObjectId(query.companyOrganizer);
  }

  // Aggregation pipeline
  const pipeline = [
    {
      $match: matchQuery  // Match the query to filter organizations
    },
    {
      $lookup: {
        from: "users",  // Join with the Users collection
        localField: "creator",  // Match creator in Organizations with _id in Users
        foreignField: "_id",  // Match the _id in Users collection
        as: "user", // The result will be stored in a field named "user"
        pipeline: [
          {
            $project: {
              activeSubscription: 1, // Include activeSubscription field
              inActiveSubscription: 1 // Include inActiveSubscription field
            }
          }
        ]
      }
    },
    {
      $unwind: {
        path: "$user",  // Unwind the "user" array so that we can access user fields directly
        preserveNullAndEmptyArrays: true  // Preserve organizations without matching users
      }
    },
    {
      $lookup: {
        from: "users",  // Join with the Users collection
        localField: "creator",  // Match creator in Organizations with _id in Users
        foreignField: "_id",  // Match the _id in Users collection
        as: "creator", // The result will be stored in a field named "creator"
        pipeline: [
          {
            $project: {
              firstName: 1,
              lastName: 1,

            }
          }
        ]
      }
    },
    {
      $unwind: {
        path: "$creator",  // Unwind the "user" array so that we can access user fields directly
        preserveNullAndEmptyArrays: true  // Preserve organizations without matching users
      }
    },
    {
      $lookup: {
        from: "engagementevents",  // Join with the EngagementEvents collection
        localField: "_id",  // Match _id in Organizations with organization._id
        foreignField: "entityId",  // Match the entityId in EngagementEvents
        as: "viewCount",  // The result will be stored in a field named "viewCount"
        pipeline: [
          {
            $match: {
              entityType: "organizations",  // Only include engagement events of type "organizations"
              action: "view"  // Only include "view" actions
            }
          },
          {
            $group: {
              _id: "$entityId",  // Group by organization entityId
              viewCount: { $sum: 1 }  // Count the number of views for each organization
            }
          }
        ]
      }
    },
    {
      $addFields: {
        viewCount: {
          $ifNull: [
            { $arrayElemAt: ["$viewCount.viewCount", 0] },
            0
          ]
        }
      }
    },
    {
      $lookup: {
        from: "webhookevents",  // Join with the WebhookEvents collection
        localField: "_id",  // Match _id in Organizations with organization._id
        foreignField: "organization",  // Match the organization field in WebhookEvents
        as: "revenueData",  // The result will be stored in a field named "revenueData"
        pipeline: [
          {
            $match: {
              organization: { $exists: true },  // Ensure that the organization field exists in WebhookEvents
            }
          },
          {
            $group: {
              _id: "$organization",  // Group by organization entityId
              totalRevenue: { $sum: { $toDouble: "$amount" } }  // Sum the revenue (amount) for each organization
            }
          }
        ]
      }
    },
    {
      $unwind: {
        path: "$revenueData",  // Unwind the "revenueData" array to access revenue per organization
        preserveNullAndEmptyArrays: true  // Preserve organizations without matching events
      }
    },
    {
      $addFields: {
        revenue: {
          $ifNull: [
            "$revenueData.totalRevenue",  // Get the totalRevenue from revenueData
            0  // If no revenue data, default to 0
          ]
        }
      }
    },
    {
      $project: {
        revenueData: 0  // Remove the 'revenueData' field from the final output
      }
    },



    {
      $skip: skip  // Skip the number of organizations based on the page number
    },
    {
      $limit: limit  // Limit the number of organizations based on the page size
    }
  ];

  // Perform the aggregation query
  const results = await Organizations.aggregate(pipeline);

  return results;
};

// Count by condition
const countOrganizations = async (query = {}) => {
  return Organizations.countDocuments(query);
};


const getOrganizationCounts = async (query) => {
  return getModelCounts({ model: Organizations, filterQuery: query });
}

// Find by ID
const findOrganizationById = async (id) => {
  return Organizations.findById(id);
};

// Delete
const deleteOrganizationById = async (organization) => {
  return await organization.deleteOne();
};

// Optional: keep this only for non-nested shallow updates
const findByIdAndUpdate = async (id, data) => {
  return Organizations.findByIdAndUpdate(id, { $set: data }, { new: true });
};

const getOrganizationsAsStaff = async (userId) => {
  const organizations = await Organizations.find({
    $or: [
      { creator: userId },
      { "staff.user": userId }
    ]
  }).select("basicInfo staff").lean();

  // For each organization, filter staff to only include the current user
  return organizations.map(org => {
    if (org.creator?.toString() === userId.toString()) {
      // If creator, return all staff
      return org;
    }
    // Otherwise, filter staff to only the current user
    return {
      ...org,
      staff: org.staff.filter(s => s.user.toString() === userId.toString())
    };
  });
};
const countActiveOrganizationsByCreator = async (creatorId) => {
  try {
    const count = await mongoose
      .model('Organizations')
      .countDocuments({
        creator: creatorId,
        status: "active"
      });

    return count;
  } catch (error) {
    console.error('Error counting active organizations:', error);
    throw error;
  }
};
//get user organizations

module.exports = {
  createOrganization,
  getOrganizationsWithFilters,
  countOrganizations,
  getOrganizationCounts,
  findOrganizationById,
  deleteOrganizationById,
  findByIdAndUpdate,
  getOrganizationsAsStaff,
  countActiveOrganizationsByCreator
};
