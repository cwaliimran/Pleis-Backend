// dashboardKeyMap.js

const DASHBOARD_KEYS = {
    totalReservations: {
        title: "Total Reservations",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        expiredReservations: {
        title: "Expired Reservations",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        totalCapacity: {
        title: "Total Capacity",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        totalConfirmedReservations: {
        title: "Total Confirmed Reservations",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        totalRevenue: {
        title: "Total Revenue",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        totalPrepayReservations: {
        title: "Total Prepay Reservations",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        averageGroupSize: {
        title: "Average Group Size",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        totalCapacityReserved: {
        title: "Total Capacity Reserved",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        averageReservationValue: {
        title: "Average Reservation Value",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        reservationConversionRate: {
        title: "Reservation Conversion Rate",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        pendingReservations: {
        title: "Pending Reservations",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        remainingCapacity: {
        title: "Remaining Capacity",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        

   

};

const withSubFilters = (key) => {
    const subFilters = DASHBOARD_KEYS[key]?.subFilters;

    const hasSubFilters =
        Array.isArray(subFilters) && subFilters.length > 0;

    return {
        subFilters: hasSubFilters ? subFilters : [],
        selectedSubFilter: hasSubFilters ? "all" : undefined,
    };
};

module.exports = {
    ReservationAnalytics_KEYS: DASHBOARD_KEYS,
    withSubFilters,
};
