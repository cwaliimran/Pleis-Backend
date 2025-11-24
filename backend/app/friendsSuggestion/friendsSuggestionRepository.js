
const {User} = require('@UserModel');
const { generateMeta } = require('@utils/responseUtil');
const getFriends = async ({
  page,
  limit,
  phoneNumbers,
  userId,
}) => {
  const skip = limit === 0 ? 0 : (page - 1) * limit;

  const pipeline = [];

  if (Array.isArray(phoneNumbers) && phoneNumbers.length > 0) {

    const phoneMatch = phoneNumbers.map(p => ({
      "phoneNumber.code": p.code,
      "phoneNumber.number": p.number
    }));

    // match using OR
    pipeline.push({
      $match: {
        $or: phoneMatch
      }
    });
  }
  pipeline.push({
    $match: {
      _id: { $ne: userId }
    }
  });

  pipeline.push({
    $project: {
      firstName: 1,
      lastName: 1,
      username: 1,
      phoneNumber: 1,
      profileIcon: 1,
    }
  });

  pipeline.push({ $sort: { createdAt: -1 } });
  pipeline.push({
    $facet: {
      data: [
        { $skip: skip },
        ...(limit === 0 ? [] : [{ $limit: limit }])
      ],
      totalFiltered: [{ $count: "count" }]
    }
  });

  const result = await User.aggregate(pipeline);

  const users = result[0]?.data || [];
  const totalFiltered = result[0]?.totalFiltered[0]?.count || 0;

  const meta = generateMeta(page, limit, totalFiltered);

  return { users, meta };
};
module.exports = {
  getFriends,
};
