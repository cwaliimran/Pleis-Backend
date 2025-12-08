// repositories/usersStreakRepository.js
const UsersStreaks = require("@UsersStreaksModel");
const { getModelCounts } = require("@dbUtils/queryUtil");
const  Organizations  = require('@OrganizationModel');

// Create
// Create usersStreak and automatically assign next order
const createUsersStreak = async (data) => {
  const usersStreak = new UsersStreaks(data);
  return await usersStreak.save();
};

// Get all with filters, sorted by 'order' ascending and then 'createdAt' descending
const getUsersStreaksWithFilters = async (
  filter,
  skip,
  limit,
  sort = { createdAt: -1 },
  selectFields = null
) => {
  const query = UsersStreaks.find(filter).populate({
    path: 'user',
    select: 'username firstName lastName email profileIcon',
  }).sort(sort).lean();

  if (selectFields) query.select(selectFields); // apply select dynamically
  
  if (limit > 0) query.skip(skip).limit(limit);

  return query.exec();
};

// Count by condition
const countUsersStreaks = async (query = {}) => {
  return UsersStreaks.countDocuments(query);
};

const getUsersStreaksCounts = async (query) => {
  return getModelCounts({ model: UsersStreaks, filterQuery: query });
}

// Find by ID
const findUsersStreakById = async (id) => {
  return UsersStreaks.findById(id).populate('user').populate('companyOrganizer');
};

// Update and save
const updateUsersStreakData = async (usersStreak, data) => {
  Object.assign(usersStreak, data);
  return await usersStreak.save();
};

// Delete
const deleteUsersStreakById = async (usersStreak) => {
  return await usersStreak.deleteOne();
};

//findByIdAndUpdate
const findByIdAndUpdate = async (id, data) => {
  return UsersStreaks.findByIdAndUpdate(id, data, { new: true }).populate('user').populate('companyOrganizer');
};






const attachOrganizationDetailsToStreaks = async (streaks) => {
  if (!streaks || streaks.length === 0) return [];

  const organizerIds = [...new Set(streaks.map(s => s.companyOrganizer?.toString()))];

  const organizers = await Organizations.find(
    { creator: { $in: organizerIds } },
    'creator basicInfo.name basicInfo.media.logo'
  ).lean();

  const organizerMap = {};
  organizers.forEach(org => {
    organizerMap[org.creator?.toString()] = {
      name: org.basicInfo?.name || '',
      logo: org.basicInfo?.media?.logo || ''
    };
  });

  return streaks.map(streak => {
    const orgId = streak.companyOrganizer?.toString();
    const orgDetails = organizerMap[orgId] || { name: '', logo: '' };

    return {
      ...streak,
      organizationName: orgDetails.name,
      organizationLogo: orgDetails.logo
    };
  });
};






module.exports = {
  createUsersStreak,
  getUsersStreaksWithFilters,
  countUsersStreaks,
  findUsersStreakById,
  updateUsersStreakData,
  deleteUsersStreakById,
  findByIdAndUpdate,
  getUsersStreaksCounts,
  attachOrganizationDetailsToStreaks
};