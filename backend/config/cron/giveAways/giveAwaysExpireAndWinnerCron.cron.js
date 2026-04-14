const Giveaways = require("@GiveawayModel");
const GiveawayParticipants = require("@GiveawayParticipantModel");
const { giveawayWinnersNotificationService } = require("../../../controllers/notificationHelper/giveawayWinnersNotificationService");

const giveAwaysExpireAndWinnerCron = async () => {
  const now = new Date();

  try {
    // Step 1: Fetch the giveaways that are eligible for update
    const giveawaysToUpdate = await Giveaways.find(
      { endDateTime: { $lte: now }, status: "active" }
    )
      .select('_id numberOfWinners ticketsPerWinner event ticket') // Only select the needed fields
      .populate('event ticket'); // Populate the event and ticket references

    // Exit early if no giveaways are found to update
    if (giveawaysToUpdate.length === 0) {
      return;
    }

    // Step 2: Update the giveaways' status and giveawayStatus
    const giveawayIds = giveawaysToUpdate.map(g => g._id);
    await Giveaways.updateMany(
      { _id: { $in: giveawayIds } },
      { $set: { status: "inactive", giveawayStatus: "completed" } }
    );

    // Step 3: Fetch participants in bulk for the updated giveaways
    const participants = await GiveawayParticipants.find({ giveaway: { $in: giveawayIds } }).populate('user'); // Populate the 'user' field to get the full user object

    // Prepare for bulk update and notification
    const winnersToUpdate = [];
    const winnersByEvent = {}; // To store winners per event for notification

    giveawaysToUpdate.forEach(giveaway => {
      const { _id, numberOfWinners, event } = giveaway;
      const participantsForGiveaway = participants.filter(participant => participant.giveaway.toString() === _id.toString());

      // Step 4: Determine the winners (either all or a random selection)
      let winners = [];
      if (participantsForGiveaway.length <= numberOfWinners) {
        winners = participantsForGiveaway; // All are winners if fewer than the required number
      } else {
        winners = shuffleArray(participantsForGiveaway).slice(0, numberOfWinners); // Random selection
      }

      // Add winners to bulk update and store for notification
      winners.forEach(winner => {
        winnersToUpdate.push({
          updateOne: {
            filter: { _id: winner._id },
            update: { $set: { isWinner: true } }
          }
        });

        // Store winners per event for notification
        if (!winnersByEvent[event]) {
          winnersByEvent[event] = [];
        }
        winnersByEvent[event].push(winner.user); // Store the entire user object
      });
    });

    // Step 5: Bulk update participants to mark as winners
    if (winnersToUpdate.length > 0) {
      const bulkResult = await GiveawayParticipants.bulkWrite(winnersToUpdate);
    }

    // Step 6: Send notification for each event
    for (let eventId in winnersByEvent) {
      const winnerUsers = winnersByEvent[eventId];
      const event = giveawaysToUpdate.find(g => g.event.toString() === eventId); // Get
      if (event) {
        await giveawayWinnersNotificationService({
          userIds: winnerUsers.map(user => user._id), // Extract user IDs from the user objects
          ticket: event.ticket.title,
          event: event.event.basicInfo.title,
          eventId: event.event._id,
          action: "GIVEAWAY_WINNER",
          image: event.event?.basicInfo?.media.name ? event.event.basicInfo.media.name : null,
        }).catch(err => {
          console.error("Giveaway winner notification failed:", err);
        });
      }
    }
  } catch (err) {
    console.error("Giveaways expiry and winner cron failed:", err);
  }
};

// Helper function to shuffle an array (Fisher-Yates shuffle)
const shuffleArray = (array) => {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
};

module.exports = { giveAwaysExpireAndWinnerCron };