const months = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];

const ALL_REGIONS = [
  "Asia","Europe","Africa","Americas","Oceania","Other"
];

const timezoneToRegion = (tz = "") => {
  if (tz.startsWith("Asia/")) return "Asia";
  if (tz.startsWith("Europe/")) return "Europe";
  if (tz.startsWith("Africa/")) return "Africa";
  if (tz.startsWith("America/") || tz.startsWith("US/")) return "Americas";
  if (tz.startsWith("Australia/") || tz.startsWith("Pacific/")) return "Oceania";
  return "Other";
};

const buildClubMembersDashboardAnalytics = (rows = []) => {
  const now = new Date();

  /* -------- Buckets -------- */
  const ageBuckets = {
    "18-24": 0,
    "25-34": 0,
    "35-44": 0,
    "45-54": 0,
    "55+": 0,
  };

  const genderCount = { Male: 0, Female: 0, Other: 0 };
  const growth = Array(12).fill(0);

  let active = 0;
  let left = 0;

  const regionStats = {};
  ALL_REGIONS.forEach(region => {
    regionStats[region] = { males: 0, females: 0, others: 0 };
  });

  /* ----------------------------------
     SINGLE PASS OVER MEMBERS
  ---------------------------------- */
  for (const m of rows) {
    /* ---- Monthly Growth ---- */
    if (m.createdAt) {
      const month = new Date(m.createdAt).getMonth();
      if (month >= 0 && month < 12) growth[month]++;
    }

    /* ---- Member Activity ---- */
    if (m.status === "active") active++;
    else if (m.status === "left") left++;

    /* ---- Gender (safe) ---- */
    const gender =
      m.gender === "Male" || m.gender === "Female" || m.gender === "Other"
        ? m.gender
        : "Other";

    genderCount[gender]++;

    /* ---- Age ---- */
    if (m.dob) {
      const dob = new Date(m.dob);
      if (!isNaN(dob)) {
        const age = Math.floor(
          (now - dob) / (365.25 * 24 * 60 * 60 * 1000)
        );

        if (age >= 18 && age < 25) ageBuckets["18-24"]++;
        else if (age < 35) ageBuckets["25-34"]++;
        else if (age < 45) ageBuckets["35-44"]++;
        else if (age < 55) ageBuckets["45-54"]++;
        else ageBuckets["55+"]++;
      }
    }

    /* ---- Region ---- */
    const region = timezoneToRegion(m.timezone);
    if (gender === "Male") regionStats[region].males++;
    else if (gender === "Female") regionStats[region].females++;
    else regionStats[region].others++;
  }

  /* ----------------------------------
     TOTALS (AFTER LOOP)
  ---------------------------------- */
  const activityTotal = active + left || 1;

  const totalGender =
    genderCount.Male + genderCount.Female + genderCount.Other || 1;

  /* ----------------------------------
     UI-READY RESPONSE
  ---------------------------------- */
  return {
    newMembersOverTime: months.map((month, i) => ({
      month,
      members: growth[i],
    })),

    memberActivity: {
      active: {
        count: active,
        percent: Math.round((active / activityTotal) * 100),
      },
      left: {
        count: left,
        percent: Math.round((left / activityTotal) * 100),
      },
    },

    ageDemographics: Object.entries(ageBuckets).map(
      ([ageGroup, total]) => ({ ageGroup, total })
    ),

    genderAnalytics: [
      {
        name: "Males",
        count: genderCount.Male,
        percent: Math.round((genderCount.Male / totalGender) * 100),
      },
      {
        name: "Females",
        count: genderCount.Female,
        percent: Math.round((genderCount.Female / totalGender) * 100),
      },
      {
        name: "Others",
        count: genderCount.Other,
        percent: Math.round((genderCount.Other / totalGender) * 100),
      },
    ],

    regionOverview: ALL_REGIONS.map(region => ({
      region,
      ...regionStats[region],
    })),
  };
};

module.exports = { buildClubMembersDashboardAnalytics };
