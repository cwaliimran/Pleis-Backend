const mongoose = require("mongoose");

const toIdString = (value) => {
  if (value == null || value === "") return null;
  if (typeof value === "object" && value._id) return String(value._id);
  return String(value);
};

const toMenuIdArray = (menu) => {
  if (menu == null || menu === "") return [];
  const list = Array.isArray(menu) ? menu : [menu];
  return [...new Set(list.map(toIdString).filter(Boolean))];
};

const toObjectIdArray = (menu) =>
  toMenuIdArray(menu)
    .filter((id) => mongoose.Types.ObjectId.isValid(id))
    .map((id) => new mongoose.Types.ObjectId(id));

const firstMenuId = (menu) => toMenuIdArray(menu)[0] || null;

const resolveMenuIdsFromBody = ({ menuIds, menu } = {}) => {
  if (menuIds !== undefined) return toObjectIdArray(menuIds);
  if (menu !== undefined) return toObjectIdArray(menu);
  return undefined;
};

const attachMenuIds = (obj) => {
  if (!obj) return obj;
  const list =
    obj.menu == null ? [] : Array.isArray(obj.menu) ? obj.menu : [obj.menu];
  obj.menu = list;
  obj.menuIds = list.map((entry) => (entry && entry._id) || entry);
  return obj;
};

/** Aggregation $set that appends a menu id whether `menu` is still a scalar or already an array. */
const addMenuIdPipeline = (menuObjectId) => [
  {
    $set: {
      menu: {
        $let: {
          vars: {
            current: {
              $cond: [
                { $eq: [{ $type: "$menu" }, "array"] },
                "$menu",
                {
                  $cond: [
                    { $in: [{ $type: "$menu" }, ["missing", "null"]] },
                    [],
                    ["$menu"],
                  ],
                },
              ],
            },
          },
          in: { $setUnion: ["$$current", [menuObjectId]] },
        },
      },
    },
  },
];

module.exports = {
  toMenuIdArray,
  toObjectIdArray,
  firstMenuId,
  resolveMenuIdsFromBody,
  attachMenuIds,
  addMenuIdPipeline,
};
