// utils/dashboardKeyMatch.js
const buildMatchByKey = ({ key, subFilter }) => {
    const base = {
    };

    if (key === "totalUsers") {
        base["accountState.status"] = { $ne: "deleted" };
        base["accountState.userType"] = "user";


        if (subFilter === "active") {
            base["accountState.status"] = "active";
        }

        if (subFilter === "suspended") {
            base["accountState.status"] = "suspended";
        }
    }

    if (key === "totalOrganizers") {
        base["accountState.status"] = { $ne: "deleted" };
        base["accountState.userType"] = "organizer";
        if (subFilter === "active") {
            base["accountState.status"] = "active";
        }

        if (subFilter === "suspended") {
            base["accountState.status"] = "suspended";
        }
    }

    if (key === "activeUsers") {
        base["accountState.userType"] = "user";
        base["accountState.status"] = "active";
    }

    if (key === "totalEvents") {
        if (subFilter === "active") {
            base["status"] = "active";
        }

        if (subFilter === "completed") {
            base["status"] = "completed";
        }
    }

    if (key === "ticketsSold") {
        if (subFilter === "pending") {
            base["status"] = "pending";
        }

        if (subFilter === "confirmed") {
            base["status"] = "confirmed";
        }

        if (subFilter === "cancelled") {
            base["status"] = "cancelled";
        }

        if (subFilter === "completed") {
            base["status"] = "completed";
        }
    }

    return base;
};


module.exports = {
    buildMatchByKey,
};
