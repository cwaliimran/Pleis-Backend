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
    case "earnPoints":
      return Globalloyalty;
    case "buyMenuItem":
      return GlobalcheckInOrder;
    case "referUsers":
      return GlobalReferUsersQr;
    default:
      return GlobalBase; // fallback
  }
};

// Create Qr
const createQr = async (data) => {
  try {
    console.log("Incoming data:", data);  // Log incoming data for debugging
    console.log("data ",data );
    // Get the model based on taskType
    const Model = getModelByTaskType(data.globalQrType);
    console.log("Model selected:", Model.name);  // Log the selected model
    console.log("data ",data );
    // Create QR object based on the selected model
    const Qr = new Model(data);
console.log("data ",data );
    // Debugging: Log the Qr document before saving
    console.log("Document to save:", Qr);

    // Save the QR document to the database
    await Qr.save();
    console.log("QR saved:", Qr);

    return Qr;
  } catch (err) {
    console.error("Error creating QR:", err);  // Log error if any
    throw err;
  }
};

// Get Qrs with population
const getQrsWithFilters = async (query = {}, skip = 0, limit = 10) => {
  return GlobalQr.find(query)
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
  return GlobalQr.countDocuments(query);
};

// Find by ID with population
const findQrById = async (id) => {
  return GlobalQr.findById(id)
    .populate("taskMenuItem")
    .populate("reward.rewardMenuItem")
    .populate("tierLimit");
};

// Update and save
const updateQrData = async (Qr, data) => {
  Object.assign(GlobalQr, data);
  return await GlobalQr.save();
};

// Delete
const deleteQrById = async (Qr) => {
  return await GlobalQr.deleteOne();
};

// findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return GlobalQr.findByIdAndUpdate(id, data, { new: true })
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
