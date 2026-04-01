// dashboardKeyMap.js

const DASHBOARD_KEYS = {
    totalReferralsCompleted: {  // used
        title: "Total Referrals Completed",
        subFilters: [
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "suspended", label: "Suspended" },
        ],
    },
    totalPointsGiven: {  // used
        title: "Total Points Given",
        subFilters: [
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "suspended", label: "Suspended" },
        ],
    },
    referrerPoints: {  // used
        title: "Points Per Referral",
        subFilters: [
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "suspended", label: "Suspended" },
        ],
    },
    status: {  // used
        title: "Referral Program Status",
        subFilters: [
            { key: "all", label: "All" },
            { key: "active", label: "Active" },
            { key: "suspended", label: "Suspended" },
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
    ReferralAnalytics_KEYS: DASHBOARD_KEYS,
    withSubFilters,
};
