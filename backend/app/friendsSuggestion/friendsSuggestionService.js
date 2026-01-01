const friendsSuggestion = require("./friendsSuggestionRepository");
const { userReservationsFormatter } = require("../reservations/formaters/reservationFormetter");
const { formatCategory } = require("./formater/categoryFormatter");

const getFriendSuggestions = async ({
  timezone,
  page,
  limit, 
  userId,
}) => {
  try {
    // Pass everything to repo exactly as-is
    let { users, meta } = await friendsSuggestion.getFriendSuggestions({
      timezone,
      page,
      limit,
      userId,
    });

    // No users found
    if (!users || users.length === 0) {
      return { users: [], meta };
    }

    // Format users
    users = users.map((user) => formatCategory(user, timezone));

    return {
      users,
      meta,
    };

  } catch (error) {
    console.error("addContacts service error:", error);

    return {
      users: [],
      meta: {
        totalRecords: 0,
        currentPage: 1,
        totalPages: 1,
        limit: limit || 10,
      },
    };
  }
};


const addContacts = async ({
  phoneNumbers,  
  userId,
}) => {
  try {
    let userContacts = await friendsSuggestion.addContacts({
      phoneNumbers,   
      userId,
    });


    return userContacts

  } catch (error) {

    return {

      error: "Failed to add contacts.",
    };
  }
};
module.exports = {
  addContacts,
  getFriendSuggestions
};