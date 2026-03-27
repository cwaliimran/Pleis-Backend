// dashboardKeyMap.js

const DASHBOARD_KEYS = {
    totalUsers: {  // used
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

    activeUsers: {   // used
        title: "Active Users",
        subFilters: [
            { key: "all", label: "All" },
            { key: "today", label: "Today" },
            { key: "thisWeek", label: "This Week" },
            { key: "thisMonth", label: "This Month" },
        ],
    },
    inactiveUsers: {   // used
        title: "Inactive Users",
        subFilters: [
            { key: "all", label: "All" },
            { key: "today", label: "Today" },
            { key: "thisWeek", label: "This Week" },
            { key: "thisMonth", label: "This Month" },
        ],
    },
    newUsers: {   // used
        title: "New Users",
        subFilters: [
            { key: "all", label: "All" },
            { key: "today", label: "Today" },
            { key: "thisWeek", label: "This Week" },
            { key: "thisMonth", label: "This Month" },
        ],
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
