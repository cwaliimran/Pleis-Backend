const months = [
  "Jan","Feb","Mar","Apr","May","Jun",
  "Jul","Aug","Sep","Oct","Nov","Dec"
];

const buildFollowersOverTime = (rows = []) => {
  const map = {};

  rows.forEach(r => {
    map[r._id] = r.followers;
  });

  return months.map((m, i) => ({
    month: m,
    followers: map[i + 1] || 0
  }));
};

module.exports = { buildFollowersOverTime };