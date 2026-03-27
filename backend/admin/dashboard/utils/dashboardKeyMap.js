// dashboardKeyMap.js

const DASHBOARD_KEYS = {
    totalUsers: {
        title: "Total Users",
        subFilters: [
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "suspended", label: "Suspended" },
        ],
    },

    totalOrganizers: {
        title: "Total Organizers",
        subFilters: [
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "suspended", label: "Suspended" },
        ],
    },
    totalOrganizations: {
        title: "Total Organizations",
        subFilters: [
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "inactive", label: "inactive" },
        ],
    },
    totalReservations: {
        title: "Total Reservations",
        subFilters: [
            { key: "all", label: "All" },
            { key: "pending", label: "Pending" },
            { key: "confirmed", label: "Confirmed" },
            { key: "cancelled", label: "Cancelled" },
            { key: "completed", label: "Completed" },
        ],
    },
    bookedReservations: {
        title: "Booked Reservations",
        subFilters: [
            { key: "all", label: "All" },
            { key: "pending", label: "Pending" },
            { key: "confirmed", label: "Confirmed" },
            { key: "cancelled", label: "Cancelled" },
            { key: "completed", label: "Completed" },
        ],
    },
    totalClubMembers: {
        title: "Total Club Members",
        subFilters: [
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "inactive", label: "Inactive" },
        ],
    },
    activeClubMembers: {
        title: "Active Club Members",
        subFilters: [   
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "inactive", label: "Inactive" },
        ],
    },
    activeUsers: {
        title: "Active Users",
        subFilters: [
            { key: "all", label: "All" },
            { key: "today", label: "Today" },
            { key: "thisWeek", label: "This Week" },
            { key: "thisMonth", label: "This Month" },
        ],
    },
    totalEvents: {
        title: "Total Events",
        subFilters: [
            { key: "all", label: "All" },
            { key: "completed", label: "Completed" },
        ],
    },


    activeEvents: {
        title: "Active Events",
        subFilters: [
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "completed", label: "Completed" },
        ],
    },
    ticketsSold: {
        title: "Tickets Sold",
        subFilters: [
            { key: "pending", label: "Pending" },
            { key: "confirmed", label: "Confirmed" },
            { key: "cancelled", label: "Cancelled" },
            { key: "completed", label: "Completed" },
        ],
    },
    averageTicketPrice: {
        title: "Average Ticket Price",
        subFilters: [],
    },
    averageRevenuePerUser: {
        title: "Avg Revenue per User",
        subFilters: [],
    },
    totalRevenue: {
        title: "Total Revenue",
        subFilters: [],
    },
    totalMobilePayments: {
        title: "Total Mobile Payments",
        subFilters: [],
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
    DASHBOARD_KEYS,
    withSubFilters,
};
