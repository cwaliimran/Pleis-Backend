function formatChallengesByTierKey(challenges = [], tierKey) {
    return challenges.map(item => formatSingleChallengeByTierKey({ ...item }, tierKey));
}

function formatSingleChallengeByTierKey(item, tierKey) {
    if (!tierKey || !item?.tierLimit) return item;

    const { essential, preferred, premier, ...restTier } = item.tierLimit;
    const current = item.tierLimit[tierKey];

    item.tierLimit = {
        ...restTier,
        entryPoints: current?.entryPoints ?? null,
        retainPoints: current?.retainPoints ?? null,
    };

    delete item.tierLimit.createdAt;
    delete item.tierLimit.updatedAt;
    delete item.tierLimit.status;
    delete item.tierLimit.__v;

    return item;
}


module.exports = { formatChallengesByTierKey };
