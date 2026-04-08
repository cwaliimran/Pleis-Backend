const buildGlobalLoyaltyPointsPertWalletType = (rows = []) => {
  return {
    globalLoyaltyPointsPertWalletType: rows.map(r => ({
      name: r._id,
      count: Math.round(r.count || 0),
      points: Math.round(r.points || 0)
    }))
  };
};

module.exports = { buildGlobalLoyaltyPointsPertWalletType };