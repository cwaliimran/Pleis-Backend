
const { UserContacts } = require('@UserContacts');
const {User} = require('@UserModel');
const { generateMeta } = require('@utils/responseUtil');
const { splitPhoneNumbers } = require('./formater/splitnumberToCountryCode');

const getPhoneNumbers = async (userId) => {
  try {
    // Fetch the user contacts by userId
    const userContacts = await UserContacts.findOne({ userId });

    // If user contacts are found, return the phoneNumbers array
    if (userContacts) {
      return userContacts.phoneNumbers;
    } else {
      // If no contacts found, return an empty array
      return [];
    }
  } catch (err) {
    throw err;
  }
};

const getFriendSuggestions = async ({
  page,
  limit,
  userId,
}) => {
 const phoneNumbers= await splitPhoneNumbers(await getPhoneNumbers(userId));
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
const addContacts = async ({ phoneNumbers, userId }) => {
  try {
    // Remove duplicates from the provided phoneNumbers array
    const uniquePhoneNumbers = [...new Set(phoneNumbers)];

    // Fetch existing user contacts
    const existingUserContacts = await UserContacts.findOne({ userId });

    // If user contacts exist, only add new unique phone numbers that are not already saved
    if (existingUserContacts) {
      // Filter out phone numbers that are already in the user's contact list
      const newPhoneNumbers = uniquePhoneNumbers.filter(
        phoneNumber => !existingUserContacts.phoneNumbers.includes(phoneNumber)
      );

      // If there are new unique phone numbers, add them to the array
      if (newPhoneNumbers.length > 0) {
        existingUserContacts.phoneNumbers.push(...newPhoneNumbers);
        await existingUserContacts.save();
      }

      // Return the updated user contacts
      return existingUserContacts;
    } else {
      // If no existing user contacts, create a new entry with the unique phone numbers
      const data = { phoneNumbers: uniquePhoneNumbers, userId };
      const userContacts = new UserContacts(data);
      await userContacts.save();
      return userContacts;
    }
  } catch (err) {
    throw err;
  }
};



module.exports = {
  addContacts,
  getFriendSuggestions
};
