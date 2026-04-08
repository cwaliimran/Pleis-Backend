// dashboardKeyMap.js

const DASHBOARD_KEYS = {
    totalUsersRead: {
        title: "Total Users Read",
        subFilters: [
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "suspended", label: "Suspended" },
        ],
    },

    percentageUsersRead: {
        title: "Percentage Users Read",
        subFilters: [
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "suspended", label: "Suspended" },
        ],
    },
    totalNotificationsSend: {
        title: "Total Notifications Sent",
        subFilters: [
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "inactive", label: "Inactive" },
        ],
    },
    totalUsersDelivered: {
        title: "Total Users Delivered",
        subFilters: [
            { key: "all", label: "All" },
            { key: "pending", label: "Pending" },
            { key: "confirmed", label: "Confirmed" },
            { key: "cancelled", label: "Cancelled" },
            { key: "completed", label: "Completed" },
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
