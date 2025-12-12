const {Events} = require("@EventsModel");
const fetchEventDetails = async (eventId) => {
  try {
    // Fetch event details from the Event collection using eventId
    const event = await Events.findById(eventId);
    
    if (event) {
      return {
        eventTitle: event.basicInfo.title,
        image: event.basicInfo.media.name || "no image",  // Assuming 'name' contains the image URL
      };
    }
    return null; // Return null if no event is found
  } catch (error) {

    return null; // Return null in case of an error
  }
};
module.exports = {
  fetchEventDetails,
};