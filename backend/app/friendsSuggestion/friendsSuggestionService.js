const friendsSuggestion = require("./friendsSuggestionRepository");
const { userReservationsFormatter } = require("../reservations/formaters/reservationFormetter");




const getFriends = async ({
  timezone,
  page,
  limit,
  phoneNumbers,  
  userId,
}) => {
  try {
    // Pass everything to repo exactly as-is
    let { users, meta } = await friendsSuggestion.getFriends({
      timezone,
      page,
      limit,
      phoneNumbers,   
      userId,
    });

    // No users found
    if (!users || users.length === 0) {
      return { users: [], meta };
    }

    // Format users
    users = users.map((user) => userReservationsFormatter(user, timezone));

    return {
      users,
      meta,
    };

  } catch (error) {
    console.error("getFriends service error:", error);

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
module.exports = {
  getFriends,
};