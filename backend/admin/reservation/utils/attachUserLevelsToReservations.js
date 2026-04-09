const attachUserLevelsToReservations = ({
  reservations = [],
  clubMemberMap = {},
  tierIdToTitle = {}
}) => {
  return reservations.map(r => {
    // ✅ Handle null userId or companyOrganizer
    if (!r.userId || !r.companyOrganizer) {
      r.tier = null;
      return r;
    }

    const key = `${r.userId.toString()}|${r.companyOrganizer.toString()}`;
    const member = clubMemberMap[key];

    if (!member) {
      r.tier = null;
      return r;
    }

    r.tier = {
      tierId: member.levelId,
      title: tierIdToTitle[member.levelId] || null,
      tierKey: member.tierKey
    };

    return r;
  });
};

const buildClubMemberMap = (members = []) => {
  const map = {};

  for (const m of members) {
    // ✅ Skip invalid data safely
    if (!m.level || !m.user || !m.companyOrganizer) continue;

    const key = `${m.user.toString()}|${m.companyOrganizer.toString()}`;
    map[key] = {
      levelId: m.level.toString(),
      tierKey: m.tierKey
    };
  }

  return map;
};

module.exports = { attachUserLevelsToReservations, buildClubMemberMap };