
const CONSTANTS = require("../../config/CONSTANTS");

const getAppSettings = () => {
    return {
        taxRateBooking: CONSTANTS.TAX_RATE_BOOKING,
        taxRateReservation: CONSTANTS.TAX_RATE_RESERVATION,
    };
};

module.exports = {
    getAppSettings,
};
