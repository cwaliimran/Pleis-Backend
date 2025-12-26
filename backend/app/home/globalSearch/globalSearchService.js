
const { formatNearByOrganization } = require("../../../commonModules/organizations/formatter/formatOrganization");
const { formatSuggestedClub } = require("../../loyalty/clubMembers/formatters/formatSuggestedClubs");
const {
  searchEvents,
  searchOrganizations,
  searchLoyaltyClubs
} = require("./globalSearchRepo");


const SEARCH_HANDLERS = {
  events: searchEvents,
  organizations: searchOrganizations,
  loyaltyClubs: searchLoyaltyClubs
};


const globalSearchService = async (ctx) => {
  const { type } = ctx;

  const selectedKeys =
    type && type !== "all"
      ? [type]
      : Object.keys(SEARCH_HANDLERS);

  const promises = selectedKeys.map(async (key) => {
    const handler = SEARCH_HANDLERS[key];

    // Unknown type explicitly requested
    if (!handler) {
      if (type && type !== "all") {
        throw new Error(`Unsupported search type: ${type}`);
      }

      // When "all", just skip unknown keys silently
      return null;
    }

    const result = await handler(ctx);

    return {
      key,
      title: mapTitle(key),
      data: result.data.map(item =>
        formatResultItem(key, item, ctx.timezone)
      ),
      meta: result.meta
    };
  });

  const results = await Promise.all(promises);

  // remove null entries
  return results.filter(Boolean);
};


function mapTitle(key) {
  switch (key) {
    case "events": return "Events";
    case "organizations": return "Organizers";
    case "loyaltyClubs": return "Loyalty Clubs";
    default: return key;
  }
}

function formatResultItem(key, item, timezone) {
  switch (key) {
    case "events":
      return item //already formatted //formatEventResponse(item);
    case "organizations":
      return formatNearByOrganization(item, timezone);
    case "loyaltyClubs":
      return formatSuggestedClub(item);
    default:
      return item;
  }
}


module.exports = {
  globalSearchService
};