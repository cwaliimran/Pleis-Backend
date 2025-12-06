const {
    getStartAndEndOfDay,
    getStartAndEndOfWeek,
    getStartAndEndOfMonth,
} = require("@utils/responseUtil");
const moment = require("moment");

const getDateRanges = ({ dateFilter, timezone }) => {
    const now = new Date();

    if (dateFilter === "all") return null;

    if (dateFilter === "today") {
        const { start, end } = getStartAndEndOfDay(now, timezone);
        const prev = getStartAndEndOfDay(
            moment(now).subtract(1, "day"),
            timezone
        );

        return {
            start,
            end,
            prevStart: prev.start,
            prevEnd: prev.end,
        };
    }

    if (dateFilter === "thisWeek") {
        const { start, end } = getStartAndEndOfWeek(now, timezone);
        const prev = getStartAndEndOfWeek(
            moment(now).subtract(1, "week"),
            timezone
        );

        return {
            start,
            end,
            prevStart: prev.start,
            prevEnd: prev.end,
        };
    }

    if (dateFilter === "thisMonth") {
        const { start, end } = getStartAndEndOfMonth(now, timezone);
        const prev = getStartAndEndOfMonth(
            moment(now).subtract(1, "month"),
            timezone
        );

        return {
            start,
            end,
            prevStart: prev.start,
            prevEnd: prev.end,
        };
    }

    return null;
};

const calculateGrowth = (current, previous) => {
    if (previous === 0) {
        if (current > 0) return 100;
        return 0;
    }

    const growth = +(((current - previous) / previous) * 100).toFixed(2);
    return isNaN(growth) ? 0 : growth;
};

module.exports = {
    getDateRanges,
    calculateGrowth,
};
