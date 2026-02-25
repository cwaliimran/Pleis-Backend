
const { sendResponse, getReadableErrorMessage, validateParams, convertTimezoneToUtc, parsePaginationParams } = require("@utils/responseUtil");
const generalAPIServices = require("./generalAPIService");
const getVenueTypes = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date } = req.query;

  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const { venueTypes, meta } = await generalAPIServices.getVenueTypes({
      page,
      limit,
      keyword,
      status,
      date
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "venue_types_fetched_successfully",
      data: venueTypes,
      meta,
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};
const getOrganizations = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date ,companyOrganizer} = req.query;
    if(!companyOrganizer){
  companyOrganizer=req.user._id;
  }
if(!companyOrganizer){
  return sendResponse({
    res,
    statusCode: 400,
    translationKey: "company_organizer_id_required",
  });
}
  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const {organizations} = await generalAPIServices.getOrganizations({
      page,
      limit,
      keyword,
      status,
      date,
      timezone:req.user.timezone,
      companyOrganizer
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "organizations_fetched_successfully",
      data: organizations,

    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};
const getVenues = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date ,organization} = req.query;

 const CompanyOrganizer=req.user._id;

  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const {Venues} = await generalAPIServices.getVenues({
      page,
      limit,
      keyword,
      status,
      date,
      organization,
      CompanyOrganizer
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "organizations_fetched_successfully",
      data: Venues,

    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};
const getCategories = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date} = req.query;

  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const {Categories} = await generalAPIServices.getCategories({
      page,
      limit,
      keyword,
      status,
      date
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "organizations_fetched_successfully",
      data: Categories,

    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};
const getTags = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date} = req.query;

  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const {Tags} = await generalAPIServices.getTags({
      page,
      limit,
      keyword,
      status,
      date
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "tags_fetched_successfully",
      data: Tags,

    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};
const getEvents = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date,organization } = req.query;

  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const{ Events } = await generalAPIServices.getEvents({
      page,
      limit,
      keyword,
      status,
      date,
      organization,
      creator:req.user._id
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "events_fetched_successfully",
      data: Events
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};
const getmenuItemCategories = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date,companyOrganizer } = req.query;
if(!companyOrganizer){
  companyOrganizer=req.user._id;
  }
  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const{ itemCategories } = await generalAPIServices.getmenuItemCategories({
      page,
      limit,
      keyword,
      status,
      date,
      companyOrganizer,
      creator:req.user._id
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_item_categories_fetched_successfully",
      data: itemCategories
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};
const getmenu = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date,organization } = req.query;

  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const{ menu } = await generalAPIServices.getmenu({
      page,
      limit,
      keyword,
      status,
      date,
      organization,
      creator:req.user._id
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_fetched_successfully",
      data: menu
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};
const getmenuItem = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date,menu } = req.query;
if(!menu){
  return sendResponse({
    res,
    statusCode: 400,
    translationKey: "menu_id_required", 
 
  }
  );
}
  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const{ itemCategories } = await generalAPIServices.getmenuItem({
      page,
      limit,
      keyword,
      status,
      date,
      menu,
      creator:req.user._id
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "menu_items_fetched_successfully",
      data: itemCategories
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};
const getTiers = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  let { keyword, status, date } = req.query;
  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const{ tiers } = await generalAPIServices.getTiers({
      page,
      limit,
      keyword,
      status,
      date,
      creator:req.user._id
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "tiers_fetched_successfully",
      data: tiers
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};




const getTickting = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date,event } = req.query;

  if(!event){
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "event_id_required",
    });
  }

  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const ticktings = await generalAPIServices.getTickting({
      page,
      limit,
      keyword,
      status,
      date,
      event,
      timezone:req.user.timezone,
      creator:req.user._id
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "ticketings_fetched_successfully",
      data: ticktings
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};
const getLoyaltyRewards = async (req, res) => {
  const { page, limit } = parsePaginationParams(req);
  const { keyword, status, date } = req.query;


  try {

    if (date && !validateParams(req, res, {
      dateFields: {
        date: "YYYY-MM-DD",
      },
    })) return;


    const rewards = await generalAPIServices.getLoyaltyRewards({
      page,
      limit,
      date,
      companyOrganizer:req.user._id,
    });

    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "rewards_fetched_successfully",
      data: rewards
    });
  } catch (error) {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "internal_server",
      error,
    });
  }
};
module.exports = {getTiers,getmenuItem,getmenu, getmenuItemCategories, getVenueTypes,getOrganizations,getVenues,getCategories,getTags,getEvents,getTickting,getLoyaltyRewards };