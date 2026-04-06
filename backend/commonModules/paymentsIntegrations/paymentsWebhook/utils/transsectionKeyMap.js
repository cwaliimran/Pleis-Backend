// dashboardKeyMap.js

const DASHBOARD_KEYS = {


    totalTransactions: {  // used
        title: "Total Transactions",
        subFilters: [
            { key: "all", label: "All" },
            { key: "completed", label: "Completed" },
            { key: "failed", label: "Failed" },
        ],
    },
    totalCommission: {  // used
        title: "Total Commission",
        subFilters: [
            { key: "all", label: "All" },
            { key: "paid", label: "Paid" },
            { key: "unpaid", label: "Unpaid" },
        ],
    },
    serviceFee: {  // used
        title: "Service Fee",
        subFilters: [
            { key: "all", label: "All" },
            { key: "standard", label: "Standard" },
        ],
    },
    organizerPayout: {  // used
        title: "Organizer Payout",
        subFilters: [
            { key: "all", label: "All" },
            { key: "paid", label: "Paid" },
            { key: "unpaid", label: "Unpaid" },
        ],
    },
    totalUsers: {  // used
        title: "Total Users",
        subFilters: [
            { key: "all", label: "All" },
            { key: "new", label: "New Users" },
            { key: "returning", label: "Returning Users" },
        ],
    },
    totalAmount: {  // used
        title: "Total Amount",
        subFilters: [
            { key: "all", label: "All" },
            { key: "paid", label: "Paid" },
            { key: "refunded", label: "Refunded" },
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
    TRANSSECTION_KEYS: DASHBOARD_KEYS,
    withSubFilters,
};
