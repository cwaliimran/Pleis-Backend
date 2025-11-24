const countryData = require("./countryCodes.json");
function splitPhoneNumbers(phoneList) {
  // Create a simple array of dial codes
  const dialCodes = countryData.map(item => item.dial_code);

  // Sort longest-first to avoid incorrect shorter matches
  dialCodes.sort((a, b) => b.length - a.length);

  return phoneList.map(fullPhone => {
    // Find the matching dial code
    const code = dialCodes.find(c => fullPhone.startsWith(c));

    // Extract the remaining number
    const number = code ? fullPhone.replace(code, "") : fullPhone;

    return { code, number };
  });
}
module.exports = {
splitPhoneNumbers,
};