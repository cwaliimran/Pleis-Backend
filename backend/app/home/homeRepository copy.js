// homeRepository.js
const mongoose = require("mongoose");
const CustomCategories = require("@CustomCategoriesModel");
const { Events } = require("@EventsModel");
const { User } = require("@UserModel");
const { getCurrentDateInTimezone } = require("@utils/responseUtil");

const getRemainingEventsGroupedByVenueTypesRepo = async ({ userId, timezone, limit = 20 }) => {
    try {
        const now = getCurrentDateInTimezone({ timezone });
        const userObjectId = new mongoose.Types.ObjectId(userId);

        // ----------------------------------------------
        // 1️⃣ Fetch IDs used in any custom category
        // ----------------------------------------------
        const categories = await CustomCategories.find(
            { status: { $ne: "deleted" } },
            { objects: 1 }
        ).lean();

        const usedIds = new Set();
        categories.forEach(c => {
            if (Array.isArray(c.objects)) c.objects.forEach(id => usedIds.add(String(id)));
        });

        const excludeIds = [...usedIds].map(id => new mongoose.Types.ObjectId(id));

        // ----------------------------------------------
        // 2️⃣ MAIN PIPELINE: Remaining Events → Populate venue → venueType
        // ----------------------------------------------
        const events = await Events.aggregate([
            {
                $match: {
                    _id: { $nin: excludeIds },
                    status: "active",
                    "schedule.endDateTime": { $gte: now }
                }
            },

            // Populate venue (so we can get venueType)
            {
                $lookup: {
                    from: "venues",
                    localField: "basicInfo.venue",
                    foreignField: "_id",
                    as: "venueInfo",
                    pipeline: [
                        {
                            $project: {
                                title: 1,
                                venueType: 1,
                                organization: 1
                            }
                        }
                    ]
                }
            },
            {
                $addFields: {
                    venueInfo: { $arrayElemAt: ["$venueInfo", 0] }
                }
            },

            // Populate venueType data
            {
                $lookup: {
                    from: "venuetypes",
                    localField: "venueInfo.venueType",
                    foreignField: "_id",
                    as: "venueTypeInfo",
                    pipeline: [
                        { $project: { title: 1, image: 1 } }
                    ]
                }
            },
            {
                $addFields: {
                    venueTypeInfo: { $arrayElemAt: ["$venueTypeInfo", 0] }
                }
            },

            // Populate organization
            {
                $lookup: {
                    from: "organizations",
                    localField: "basicInfo.organization",
                    foreignField: "_id",
                    as: "organizationInfo",
                    pipeline: [{ $project: { basicInfo: 1 } }]
                }
            },
            {
                $addFields: {
                    "basicInfo.organization": { $arrayElemAt: ["$organizationInfo", 0] }
                }
            },

            // favorite check
            {
                $lookup: {
                    from: "favorites",
                    let: { eventId: "$_id" },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $and: [
                                        { $eq: ["$targetId", "$$eventId"] },
                                        { $eq: ["$user", userObjectId] },
                                        { $eq: ["$targetType", "event"] }
                                    ]
                                }
                            }
                        },
                        { $limit: 1 }
                    ],
                    as: "favoriteInfo"
                }
            },
            {
                $addFields: {
                    isFavorite: { $gt: [{ $size: "$favoriteInfo" }, 0] }
                }
            },

            {
                $project: {
                    _id: 1,
                    basicInfo: 1,
                    schedule: 1,
                    isFavorite: 1,
                    venueType: "$venueTypeInfo"
                }
            },

            { $sort: { createdAt: -1 } },
            { $limit: limit }
        ]);

        // ----------------------------------------------
        // 3️⃣ Group by venueType.title
        // ----------------------------------------------
        const groups = {};

        events.forEach(evt => {
            const venueTypeTitle = evt.venueType?.title || "Other Venues";

            if (!groups[venueTypeTitle]) groups[venueTypeTitle] = [];
            groups[venueTypeTitle].push(evt);
        });

        // Convert into array with {key, title, data}
        const formatted = Object.keys(groups).map(title => ({
            key: `venue_type_${title.replace(/\s+/g, "_").toLowerCase()}`,
            title,
            data: groups[title]
        }));

        return formatted;

    } catch (err) {
        console.error("Error in getRemainingEventsGroupedByVenueTypesRepo", err);
        return [];
    }
};

const getRemainingOrganizersRepo = async ({ userId, limit = 10 }) => {
    const now = new Date();

    const categories = await CustomCategories.find(
        { status: { $ne: "deleted" } },
        { objects: 1 }
    ).lean();

    const usedIds = new Set();
    categories.forEach(cat => {
        if (Array.isArray(cat.objects)) {
            cat.objects.forEach(id => usedIds.add(String(id)));
        }
    });

    const excludeIds = [...usedIds].map(id => new mongoose.Types.ObjectId(id));

    const users = await User.find({
        _id: { $nin: excludeIds },
        "accountState.status": "active",
        "accountState.userType": "organizer"
    })
        .select("firstName lastName profileIcon companyDetails.loyaltySettings")
        .sort({ createdAt: -1 })
        .limit(limit)
        .lean();

    return users;
};


module.exports = {
    getRemainingEventsGroupedByVenueTypesRepo,
    getRemainingOrganizersRepo
};
