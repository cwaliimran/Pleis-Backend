const { getCurrentDateInTimezone } = require("@utils/responseUtil");
const friendRequestRepo = require("./friendRequestRepository");
const { userReservationsFormatter } = require("../reservations/formaters/reservationFormetter");
const mongoose = require('mongoose'); 




const getFriends = async ({
  timezone,
  page,
  limit,
  keyword,
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
const updateFriendRequests = async ({ id, status, userId }) => {
  try {
    // Fetch the friend request by ID
    const friendRequest = await friendRequestRepo.getFriendRequestById(id);
   

    if (!friendRequest) {
      return { error: "friend_request_not_found" };  // If no request found, return an error
    }

    // Convert userId to ObjectId for proper comparison
    const userObjectId = new mongoose.Types.ObjectId(userId);


    if (friendRequest.sender.id.toString() !== userObjectId.toString() && friendRequest.receiver.id.toString() !== userObjectId.toString()) {

      return { error: "user_not_involved" };  // If the user is not involved in this request, return an error
    }

    // Validate the status to ensure it's one of the allowed values
    if (!["accept", "reject", "cancel"].includes(status)) {
     
      return { error: "invalid_status" };  // Check if the status is valid
    }

    // Update the status based on whether the user is the sender or receiver
    if (friendRequest.sender.id.toString() === userObjectId.toString()) {
      // User is the sender, update their status
  
          friendRequest.receiver.status = status;
      friendRequest.sender.status = status;
    } else if (friendRequest.receiver.id.toString() === userObjectId.toString()) {
      // User is the receiver, update their status for both sender and receiver
     
      friendRequest.receiver.status = status;
      friendRequest.sender.status = status;  // Also update the sender's status when the receiver accepts or rejects
    }


    // Save the updated friend request
    await friendRequest.save();

    

    return {
      message: "Friend request status updated successfully",
      friendRequest,
    };
  } catch (error) {
    
    return {
      error: "Error updating friend request",  // Error handling if save fails
    };
  }
};


const unfriend = async (id, userId) => {
  try {
    const result = await friendRequestRepo.unfriend(id, userId);
    if (result.deletedCount === 0) {
      return { error: "friend_request_not_found" }; 
    }

    return { message: "Friend request deleted successfully" }; 
  } catch (error) {
    return { error: "Error deleting friend request" }; 
  }
};
const getSentFriendRequests = async ({ timezone, page, limit, keyword, status, userId, date }) => {
  try {
    let { requests, meta } = await friendRequestRepo.getSentFriendRequests({ timezone, page, limit, keyword, status, userId, date });
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

const seeFriends = async ({ timezone, page, limit, keyword, status, userId, date }) => {
  try {
    let { requests, meta } = await friendRequestRepo.seeFriends({ timezone, page, limit, keyword, status, userId, date });
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
  updateFriendRequests,
  unfriend,
  getSentFriendRequests,
  seeFriends


};