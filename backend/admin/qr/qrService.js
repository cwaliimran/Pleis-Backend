const { buildKeywordQueryFromModels } = require("@dbUtils/queryUtil");
const GlobalQr = require("@GlobalQrModel");
const QrRepo = require("./qrRepository");
const { generateMeta } = require("@utils/responseUtil");
// const formatQr = require("../../../commonModules/loyalty/Qrs/formatters/formatQr");
const { default: mongoose } = require("mongoose");
const formatqr = require("./formater/imageFormater");
const Organization = require("@OrganizationModel");
const {Events} = require("@EventsModel");
const Venues = require("@VenuesModel");
const {User} = require("@UsersModel");
const createQr = async (data) => {
  let Qr = await QrRepo.createQr(data);
  return Qr;
};
const getQrs = async ({ userId, page, limit, keyword, status, date, timezone }) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  // Build query object
  const query = {
    creator:new mongoose.Types.ObjectId(userId), // Ensure userId is treated as an ObjectId
  };

  if (status) query.status = status;
  else query.status = { $ne: "deleted" };

  if (date) {
    const start = new Date(date);
    const end = new Date(new Date(date).setDate(start.getDate() + 1));
    query.createdAt = { $gte: start, $lt: end };
  }

  if (keyword) {
    Object.assign(query, buildKeywordQueryFromModels([{ schema: Qr.schema }], keyword));
  }

  // Get Qrs with filters
  const Qrs = await QrRepo.getQrsWithFilters(query, skip, limit);

  // Loop through Qrs and populate fields based on presence of IDs
  const populatedQrs = await Promise.all(
    Qrs.map(async (qr) => {
    
if (qr.globalQrType==="organization"&&qr.organizationId) {
  const organization = await Organization.findById(qr.organizationId);
  if (organization) {
    if (organization.basicInfo && organization.basicInfo.name) {
      qr.organizationName = organization.basicInfo.name;
    }
  }
}

      if (qr.globalQrType==="event"&&qr.eventId) {
        const event = await Events.findById(qr.eventId); // Get event name
        qr.eventName =  event.basicInfo.title || 'Unknown Event';
      }

      if (qr.globalQrType==="checkInOrder"&&qr.venueId) {
        const venue = await Venues.findById(qr.venueId); // Get venue title
        qr.venueTitle = venue ? venue.title : 'Unknown Venue';
      }
            if (qr.globalQrType==="checkInOrder"&&qr.venueId) {
        const venue = await Venues.findById(qr.venueId); // Get venue title
        qr.venueTitle = venue ? venue.title : 'Unknown Venue';
      }

      if (qr.globalQrType==="checkInTableID"&&qr.venueId) {
        const venue = await Venues.findById(qr.venueId); // Get venue title
        qr.venueTitle = venue ? venue.title : 'Unknown Venue';
      }

      if (qr.loyaltyId&&qr.globalQrType==="loyalty") {
        const loyalty = await User.findById(qr.loyaltyId); // Get loyalty user's name
        qr.loyaltyClub = loyalty ? loyalty.companyDetails.loyaltySettings.title : 'Unknown User';
      }

      return qr; // Return the QR after populating necessary fields
    })
  );

  // Get counts for pagination
  const [total, active, inactive, totalFiltered] = await Promise.all([
    GlobalQr.countDocuments({ status: { $ne: "deleted" } }),
    GlobalQr.countDocuments({ status: "active" }),
    GlobalQr.countDocuments({ status: "inactive" }),
    GlobalQr.countDocuments(query),
  ]);

  const meta = generateMeta(page, limit, totalFiltered);
  meta.QrsCount = { total, active, inactive };

  // Format Qr data for timezone
  const formattedQrs = populatedQrs.map((Qr) => formatqr(Qr, timezone));

  return { Qrs: formattedQrs, meta };
};



const deleteQr = async (id) => {
  const updated = await QrRepo.findByIdAndUpdate(id, { status: "deleted" });
  return !!updated;
};



module.exports = {
  createQr,
  getQrs,
  deleteQr,
};