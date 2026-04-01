// dashboardKeyMap.js

const DASHBOARD_KEYS = {
    totalOrders: {
        title: "Total Orders",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        totalRevenue: {
        title: "Total Revenue",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        revenueAfterCommission: {
        title: "Revenue After Commission",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        averageOrderValue: {
        title: "Average Order Value",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        orderFrequencyPerHour: {
        title: "Order Frequency Per Hour",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        mostOrderedCategory: {
        title: "Most Ordered Category",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        totalItemsSold: {
        title: "Total Items Sold",
        subFilters: ["all", "today", "thisWeek", "thisMonth"],
        },
        totalLimitedTimeItems: {
        title: "Total Limited Time Items Sold",
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
    Analytics_KEYS: DASHBOARD_KEYS,
    withSubFilters,
};
