const {
  sendResponse,
  parsePaginationParams,
  validateParams,
  generateMeta,
  getReadableErrorMessage,
  convertTimezoneToUtc,
} = require("../../../helperUtils/responseUtil");
const mongoose = require('mongoose'); // Import mongoose

const Menuervice = require("./menuManagementService");





const createMenu = async (req, res) => {
  let {
    title,
    ticket,
    event,
    numberOfWinners,
    status="active",
    ticketsPerWinner,
    organization,
    endDateTime,
    MenuStatus="live",

  } = req.body;

  const creator = new  mongoose.Types.ObjectId(organization);
  const timezone = req.user.timezone;
  endDateTime = convertTimezoneToUtc(
    endDateTime,
    timezone,
    "YYYY-MM-DD hh:mm A"
  );

  if (
    !validateParams(req, res, {
      rawData: [
        "title",
        "ticket",
        "ticketsPerWinner",
        "organization",
        "endDateTime",
        "numberOfWinners",
        "event",
      ],
    })
  ) return;
 
  let data = {
    creator,
    title,
    ticket,
    event,
    numberOfWinners,
    ticketsPerWinner,
    organization,
    endDateTime,
    MenuStatus,
    status,
  };
  try {
    const Menu = await Menuervice.createMenu(data);
    if (!Menu) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: "Menu_creation_failed",
      });
    }
    return sendResponse({
      res,
      statusCode: 201,
      translationKey: "Menu_created_successfully",
      data: Menu,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};
const getMenu = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status , date, range ,organizationId,activeKeyword,Menutatus,activeMenutatus,pickupFilter} = req.query;
  try {
if(!organizationId){
  return sendResponse({
    res,
    statusCode: 400,
    translationKey: "organization_id_is_required",
  });
}

    organizationId = new  mongoose.Types.ObjectId(organizationId); 
    const timezone = req.user.timezone;
    const { Menus, meta } = await Menuervice.getMenu({
      timezone,
      page,
      limit,
      keyword,
      status,
      organizationId,
      date,
      range,
      activeKeyword,
      Menutatus,
      activeMenutatus,
      pickupFilter
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "Menu_fetched_successfully",
      data: Menus,
      meta,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};
const updateMenu = async (req, res) => {
  const { id } = req.params;
const {
  status,
  paymentStatus,
  deliveredMenuItem,
  deliveredall
} = req.body;
  if (
    !validateParams(req, res, {
      pathParams: ["id"],
      objectIdFields: ["id"],
    })
  )    return;


let data = {
  status,
  paymentStatus,
  deliveredMenuItem,
  deliveredall
};



  try {
    const updated = await Menuervice.updateMenu(id, data);
    if (updated && updated.error) {
      return sendResponse({
        res,
        statusCode: 400,
        translationKey: updated.error,
      });
    }

    if (!updated) {
      return sendResponse({
        res,
        statusCode: 404,
        translationKey: "order_not_found",
      });
    }

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "order_updated_successfully",
      data: updated,
    });
  } catch (error) {
    const readableError = getReadableErrorMessage(error);
    return sendResponse({
      res,
      statusCode: readableError.statusCode,
      translationKey: readableError.message,
      error,
    });
  }
};















module.exports = {
  getMenu,
  updateMenu,
};