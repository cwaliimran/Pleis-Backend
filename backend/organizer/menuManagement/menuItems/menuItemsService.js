// services/menuItemService.js
const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const { generateMeta, convertUtcToTimezone } = require("@utils/responseUtil");
const menuItemRepo = require("./menuItemsRepository");
const mongoose = require("mongoose");
const MenuItems = require("@MenuItemsModel");
const Menus = require("@MenusModel");
const Organizations = require("@OrganizationModel");

// const Venues = require("../../venues/Venues");
// const MenuItemCategories = require("../menuItemCategories/MenuItemCategories");
const { formatMenuItem } = require("./formatter/formatMenuItems");
const { getOrganizationIdByCompanyOrganizer } = require("../../../admin/organizations/organizationRepository");

const createMenuItem = async (data, timezone) => {
  let doc = await menuItemRepo.createMenuItem(data);
  let obj = formatMenuItem(doc, timezone);
  return obj;
};

const getMenuItems = async ({ timezone,page, limit, keyword, status, userId, date, organization }) => {
if (!organization) {
    organization = await getOrganizationIdByCompanyOrganizer(userId);
    organization = organization.map(org => org._id.toString()).join(',');
}
  const skip = limit === 0 ? 0 : (page - 1) * limit;
  let pipeline = [];

  let organizationIds = [];
  if (organization) {
    organizationIds = decodeURIComponent(organization).split(',').map(id => new mongoose.Types.ObjectId(id.trim()));
  }

  // If organizationIds are provided
  if (organizationIds.length > 0) {
    // Match the menus based on organizationIds
    pipeline.push({
      $match: {
        organization: { $in: organizationIds }
      }
    });

    // Get menuIds
    pipeline.push({
      $project: { _id: 1 }
    });

    const menus = await Menus.aggregate(pipeline);
    const menuIds = menus.map(menu => menu._id);

    if (menuIds.length === 0) {
      return { menuItems: [], meta: {} }; // Return empty if no menus found
    }

    pipeline = [];  // Reset pipeline for MenuItems aggregation

    // Match MenuItems by menuIds
    pipeline.push({
      $match: {
        menu: { $in: menuIds }
      }
    });

    // Perform the lookup to join with Menus and get organization details
    pipeline.push({
      $lookup: {
        from: "menus",  // Join with the Menus collection
        localField: "menu",  // Match menu field in MenuItems with _id in Menus
        foreignField: "_id",  // Match _id in Menus collection
        pipeline: [
          {
            $lookup: {
              from: "organizations",  // Join with Organizations collection
              localField: "organization",  // Match the organization field in Menus
              foreignField: "_id",  // Match _id in Organizations collection
              pipeline: [
                {
                  $project: {
                    _id: 1,
                    "basicInfo.name": 1  // Get the name from basicInfo in Organizations
                  }
                }
              ],
              as: "organization"  // Store the result in organization field
            }
          }
        ],
        as: "menu"  // Output array containing menu details
      }
    });

    // Unwind the menu and organization to get them as a single object
    pipeline.push({
      $unwind: {
        path: "$menu",
        preserveNullAndEmptyArrays: true  // Allow for menus that may not have an organization
      }
    });

    pipeline.push({
      $unwind: {
        path: "$menu.organization",
        preserveNullAndEmptyArrays: true  // Allow for menus that may not have an organization
      }
    });
    pipeline.push({
      $lookup: {
        from: "menuitemcategories",  // Join with the Menus collection
        localField: "category",  // Match menu field in MenuItems with _id in Menus
        foreignField: "_id",  // Match _id in Menus collection
        pipeline: [
          {
            $project: { title: 1, _id: 1 }  // Only get the name field
          }

        ],
        as: "category"  // Output array containing menu details
      }
    });
    pipeline.push({
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true  // Allow for menus that may not have an organization
      }
    });

  } else {


    // Lookup menu details from Menus collection based on userId
    pipeline.push({
      $lookup: {
        from: "menus",  // Join with the Menus collection
        localField: "menu",  // Match menu field in MenuItems with _id in Menus
        foreignField: "_id",  // Match _id in Menus collection
        pipeline: [
          {
            $lookup: {
              from: "organizations",  // Join with Organizations collection
              localField: "organization",  // Match the organization field in Menus
              foreignField: "_id",  // Match _id in Organizations collection
              pipeline: [
                {
                  $project: {
                    _id: 1,
                    "basicInfo.name": 1  // Get the name from basicInfo in Organizations
                  }
                }
              ],
              as: "organization"  // Store the result in organization field
            }
          }
        ],
        as: "menu"  // Output array containing menu details
      }
    });
    pipeline.push({
      $lookup: {
        from: "menuitemcategories",  // Join with the Menus collection
        localField: "category",  // Match menu field in MenuItems with _id in Menus
        foreignField: "_id",  // Match _id in Menus collection
        pipeline: [
          {
            $project: { title: 1, _id: 1 }  // Only get the name field
          }

        ],
        as: "category"  // Output array containing menu details
      }
    });
    pipeline.push({
      $unwind: {
        path: "$category",
        preserveNullAndEmptyArrays: true  // Allow for menus that may not have an organization
      }
    });

    pipeline.push({
      $unwind: {
        path: "$menu.organization",
        preserveNullAndEmptyArrays: true  // Allow for menus that may not have an organization
      }
    });

  }

  // Additional filters: status, date, keyword
  if (status) pipeline.push({ $match: { status } });
  else pipeline.push({ $match: { status: { $ne: "deleted" } } });

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    pipeline.push({ $match: { createdAt: { $gte: start, $lt: end } } });
  }

const safeKeyword = String(keyword || "").trim();

if (safeKeyword) {
  const keywordMatch = buildKeywordQueryFromModels(
    [
      { schema: MenuItems.schema }, // root document
      { schema: Menus.schema, prefix: "menu." },
      { schema: Organizations.schema, prefix: "menu.organization." },
    ],
    safeKeyword
  );

  if (Object.keys(keywordMatch).length) {
    pipeline.push({ $match: keywordMatch });
  }
}




  // Sort by createdAt
  pipeline.push({ $sort: { createdAt: -1 } });

  // Apply pagination
  pipeline.push({
    $facet: {
      data: [{ $skip: skip }, ...(limit === 0 ? [] : [{ $limit: limit }])],
      totalFiltered: [{ $count: "count" }]
    }
  });

  // Run the aggregation to get the menu items
  const result = await MenuItems.aggregate(pipeline);


  const menuItems = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;
const formattedMenuItems = menuItems.map(item => formatMenuItem(item, timezone));
  // Additional counts for meta: active/inactive/total by userId as creator
  const [total, active, inactive] = await Promise.all([
    Menus.countDocuments({ creator: userId, status: { $ne: "deleted" } }),
    Menus.countDocuments({ status: "active", creator: userId }),
    Menus.countDocuments({ status: "inactive", creator: userId })
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.menuItemsCount = { total, active, inactive };

  return { menuItems: formattedMenuItems, meta };
};






const updateMenuItem = async (id, data, timezone) => {
  const menuItem = await menuItemRepo.findMenuItemById(id);
  if (!menuItem) return null;

  const allowedFields = [
    "image",
    "title",
    "description",
    "type",
    "category",
    "basePrice",
    "discountPrice",
    "taxPercent",
    "menu",
    "startTime",
    "endTime",
    "status"
  ];
  const updateData = {};
  for (const key of allowedFields) {
    if (data[key] !== undefined) {
      updateData[key] = data[key];
    }
  }

  if (Object.keys(updateData).length === 0) {
    return menuItem; // nothing to update
  }

  Object.assign(menuItem, updateData);
  await menuItem.save();

  // Return updated menuItem
  let obj = formatMenuItem(menuItem, timezone);

  return obj;
};

const deleteMenuItem = async (id) => {
  const updated = await menuItemRepo.findByIdAndUpdate(id, {
    status: "deleted",
  });
  if (!updated) return null;
  return true;
};

const getMenuItemDetails = async (id) => {
  const menuItem = await menuItemRepo.findMenuItemById(id);
  if (!menuItem) return null;
  return menuItem;
};



module.exports = {
  createMenuItem,
  getMenuItems,
  updateMenuItem,
  getMenuItemDetails,
  deleteMenuItem,
};
