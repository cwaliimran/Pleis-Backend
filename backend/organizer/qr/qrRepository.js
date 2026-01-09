const {
  GlobalBase,
  GlobalcheckInTableID,
  Globalloyalty,
  GlobalcheckInOrder,
  Globaleventn,
  GlobalOrganization
} = require("../../commonModules/qrCode/models/QR");

// Decide which discriminator model to use
const getModelByTaskType = (taskType) => {
  switch (taskType) {
    case "organization":
      return GlobalOrganization;
    case "loyalty":
      return Globalloyalty;
    case "checkInOrder":
      return GlobalcheckInOrder;
    case "event":
      return Globaleventn;
          case "checkInTableID":
      return GlobalcheckInTableID;
    default:
      return GlobalBase; // fallback
  }
};

// Create Qr
const createQr = async (data) => {
  try {

    const Model = getModelByTaskType(data.globalQrType);
    const Qr = new Model(data);
    await Qr.save();
   
    return Qr;
  } catch (err) {

    throw err;
  }
};

const getQrsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return GlobalBase.find(query)
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate({
      path: "tierLimit",
      select: "image title"
    })
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(limit)
    .lean()
    .exec();
};

// Count
const countQrs = async (query = {}) => {
  return GlobalBase.countDocuments(query);
};

// Find by ID with population
const findQrById = async (id) => {
  return GlobalBase.findById(id)
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate("tierLimit");
};

// Update and save
const updateQrData = async (Qr, data) => {
  Object.assign(GlobalBase, data);
  return await GlobalBase.save();
};

// Delete
const deleteQrById = async (Qr) => {
  return await GlobalBase.deleteOne();
};

// findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return GlobalBase.findByIdAndUpdate(id, data, { new: true })
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate("tierLimit");
};

module.exports = {
  createQr,
  getQrsWithFilters,
  countQrs,
  findQrById,
  updateQrData,
  deleteQrById,
  findByIdAndUpdate,
};
