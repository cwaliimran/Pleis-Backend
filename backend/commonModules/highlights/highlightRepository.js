// repositories/highlightRepository.js
const { create } = require("lodash");
const { Highlights } = require("./Highlight");
const { Mongoose, default: mongoose } = require("mongoose");

// Create
const createHighlight = async (data) => {
  const highlight = new Highlights(data);
  return await highlight.save();
};

// Get highlights with filters
const getHighlightsWithFilters = async (query,keyword, skip, limit) => {
  const pipeline = [
    { $match: query },
    { $sort: { createdAt: -1 } },
    { $skip: skip },
    { $limit: limit },

    // Lookup from Events
    {
      $lookup: {
        from: "events",
        localField: "object",
        foreignField: "_id",
        as: "eventObject"
      }
    },
    // Lookup from Organizations
    {
      $lookup: {
        from: "organizations",
        localField: "object",
        foreignField: "_id",
        as: "orgObject"
      }
    },
    // Replace 'object' field
    {
      $addFields: {
        object: {
          $cond: [
            { $eq: ["$type", "event"] },
            { $arrayElemAt: ["$eventObject", 0] },
            { $arrayElemAt: ["$orgObject", 0] }
          ]
        }
      }
    }
  ];

  // Apply keyword filter AFTER lookup
  if (keyword) {
    const regex = { $regex: keyword, $options: "i" };

    pipeline.push({
      $match: {
        $or: [
          { title: regex }, // highlight title
          { "media.name": regex }, // highlight media
          { "object.basicInfo.title": regex }, // event title
          { "object.basicInfo.name": regex }, // org name
          { "object.basicInfo.description": regex }, // event description
          { "object.basicInfo.otherInfo.description": regex }, // org description
          { "object.basicInfo.socialLinks.facebook": regex },
          { "object.basicInfo.socialLinks.instagram": regex },
          { "object.basicInfo.socialLinks.linkedin": regex },
          { "object.basicInfo.socialLinks.youtube": regex }
        ]
      }
    });
  }

  pipeline.push({
    $project: {
      "object._id": 1,
      "object.basicInfo.media": 1,
      "object.basicInfo.title": 1,
      "object.basicInfo.name": 1,
      type: 1,
      createdAt: 1,
      meta: 1,
      status: 1,
      title: 1,
      media: 1,
      mediaInfo: 1
    }
  });

  return Highlights.aggregate(pipeline);
};



// Count by condition
const countHighlights = async (query = {}) => {
  return Highlights.countDocuments(query);
};

// Find by ID
const findHighlightById = async (id) => {
  const highlights = await Highlights.aggregate([
    { $match: { _id: new mongoose.Types.ObjectId(id) } },

    // Lookup from Events
    {
      $lookup: {
        from: "events",
        localField: "object",
        foreignField: "_id",
        as: "eventObject"
      }
    },
    // Lookup from Organizations
    {
      $lookup: {
        from: "organizations",
        localField: "object",
        foreignField: "_id",
        as: "orgObject"
      }
    },

    // Replace 'object' field with correct populated result
    {
      $addFields: {
        object: {
          $cond: [
            { $eq: ["$type", "event"] },
            { $arrayElemAt: ["$eventObject", 0] },
            { $arrayElemAt: ["$orgObject", 0] }
          ]
        }
      }
    },

    // Project final shape
    {
      $project: {
        "object._id": 1,
        "object.basicInfo.media": 1,

        // Conditionally include title only for type 'event'
        "object.basicInfo.title": {
          $switch: {
            branches: [
              {
                case: { $eq: ["$type", "event"] },
                then: "$object.basicInfo.title"
              }
            ],
            default: "$$REMOVE"
          }
        },

        // Conditionally include name only for type 'organization'
        "object.basicInfo.name": {
          $switch: {
            branches: [
              {
                case: { $eq: ["$type", "organization"] },
                then: "$object.basicInfo.name"
              }
            ],
            default: "$$REMOVE"
          }
        },

        type: 1,
        createdAt: 1,
        meta: 1,
        status: 1,
        title: 1,
        mediaInfo: 1
      }
    }
  ]);

  return highlights[0] || null;
};

const findHighlightDocById = async (id) => {
  return await Highlights.findById(id);
};


// Delete
const deleteHighlightById = async (highlight) => {
  return await highlight.deleteOne();
};

// Optional: keep this only for non-nested shallow updates
const findByIdAndUpdate = async (id, data) => {
  return Highlights.findByIdAndUpdate(id, { $set: data }, { new: true });
};
module.exports = {
  createHighlight,
  getHighlightsWithFilters,
  countHighlights,
  findHighlightById,
  findHighlightDocById,
  deleteHighlightById,
  findByIdAndUpdate,
};
