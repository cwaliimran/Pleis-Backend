
const CONSTANTS = require("../../config/CONSTANTS");

const getAppSettings = () => {
    return {
        // ORIGINAL flat rate (restore with TAX_RATE_BOOKING = 0.06):
        // taxRateBooking: CONSTANTS.TAX_RATE_BOOKING,
        taxRateReservation: CONSTANTS.TAX_RATE_RESERVATION,
        // DOC ticketing service fee: min(base, 30 EUR) + rate * item (integer cents).
        ticketingServiceFee: {
            baseCents: CONSTANTS.SERVICE_FEE_BASE_CENTS,
            baseCapCents: CONSTANTS.SERVICE_FEE_BASE_CAP_CENTS,
            rate: CONSTANTS.SERVICE_FEE_RATE,
        },
        // Back-compat for clients that still read a single rate field (rate portion only).
        taxRateBooking: CONSTANTS.SERVICE_FEE_RATE,
    };
};

module.exports = {
    getAppSettings,
};
