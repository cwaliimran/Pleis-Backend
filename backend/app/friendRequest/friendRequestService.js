const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const friendRequestRepo = require("./friendRequestRepository");
const { userReservationsFormatter } = require("../reservations/formaters/reservationFormetter");





const getFriends = async ({
  timezone,
  page,
  limit,
  keyword,
  phoneCode,
  phoneDigits,
  status,
  userId,
  date
}) => {
  try {


    // Pass everything to repo
    let { users, meta } = await friendRequestRepo.getFriends({
      timezone,
      page,
      limit,
      keyword,
      phoneCode,     // <-- separated
      phoneDigits,   // <-- separated
      status,
      userId,
      date,
    });

    // No users found
    if (!users || users.length === 0) {
      return { users: [], meta };
    }

    // Format users
    users = users.map(user => userReservationsFormatter(user, timezone));

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
const createFriendRequest = async (data) => {
  let friendRequest = await friendRequestRepo.createFriendRequest(data);
  return friendRequest;
};



const getFriendRequests = async ({ timezone, page, limit, keyword, status, userId, date }) => {
  try {
    let { requests, meta } = await friendRequestRepo.getFriendRequests({ timezone, page, limit, keyword, status, userId, date });
    if (!requests || requests.length === 0) {
      return { requests: [], meta };
    }
    // friendRequests = friendRequests.map(friendRequest => friendRequestFormatter(friendRequest, timezone));
    return {
      requests,
      meta
    };
  } catch (error) {
    return {
      requests: [],
      meta: { totalRecords: 0, currentPage: 1, totalPages: 1, limit: 10 }
    };
  }
};



module.exports = {
  getFriends,
  createFriendRequest,
  getFriendRequests,


};