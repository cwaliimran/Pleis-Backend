
const { getCategories } = require("../../admin/categories/categoriesService");
const { getPromotedEventsByFilters } = require("../../commonModules/events/eventService");
const { Highlights } = require("../../commonModules/highlights/Highlight");
const { getPublicHighlights } = require("../../commonModules/highlights/highlightService");

const getHomeService = async () => {

  try {


    //get categories

    const categories = await getCategories();

    //get promoted events
    const promotedEvents = await getPromotedEventsByFilters({ limit: 10 });


    let highlights = await getPublicHighlights({ page: 1, limit: 10, keyword: "" });
    if (!highlights || !Array.isArray(highlights.highlights) || highlights.highlights.length === 0) {
      return { highlights: [] };
    }
    highlights = highlights.highlights.map((highlight) => {
      return new Highlights(highlight).toCustomJSON(highlight);
    });

    var data = { categories, promotedEvents, highlights };

    return {
      status: true,
      data,
    };

  } catch (error) {
    // Optionally log error
    return {
      status: false,
      data: error
    };
  }

};
module.exports = {
  getHomeService,
};
