
const { formatNearByOrganization } = require("../../../commonModules/organizations/formatter/formatOrganization");
const { formatEventResponse } = require("../../events/formatter/eventFormatter");
const {
  searchEvents,
  searchOrganizations,
} = require("./globalSearchRepo");


const SEARCH_HANDLERS = {
  events: searchEvents,
  // organizations: searchOrganizations,
};


const globalSearchService = async (ctx) => {
  const { type } = ctx;

  const selectedKeys = type && type !== "all"
    ? [type]
    : Object.keys(SEARCH_HANDLERS);

  const promises = selectedKeys.map(async (key) => {
    const handler = SEARCH_HANDLERS[key];

    const result = await handler(ctx);

    return {
      key,
      title: mapTitle(key),
      data: result.data.map(item => formatResultItem(key, item, ctx.timezone)),
      meta: result.meta,
    };
  });


  return Promise.all(promises);
};

function mapTitle(key) {
  switch (key) {
    case "events": return "Events";
    case "organizations": return "Organizations";
    case "topPicks": return "Top Picks";
    case "customCategories": return "Collections";
    default: return key;
  }
}

function formatResultItem(key, item, timezone) {
  switch (key) {
    case "events":
      return item //already formatted //formatEventResponse(item);

    case "organizations":
      return formatNearByOrganization(item, timezone);
    default:
      return item;
  }
}


module.exports = {
  globalSearchService
};