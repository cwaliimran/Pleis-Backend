const fs = require("fs");
const path = require("path");
const { sendResponse } = require("../../helperUtils/responseUtil");

// Path to the JSON file
const countriesFilePath = path.join(__dirname, "../../assets/countries.json");

// Function to read the JSON file and parse it
const readJSONFile = (filePath) => {
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading file from disk: ${error}`);
    return null;
  }
};

// Read the countries data at startup
const countriesData = readJSONFile(countriesFilePath);

// Controller method to get all countries
const getCountries = (req, res) => {
  if (countriesData) {
    const countries = countriesData.map((country) => ({
      id: country.id,
      name: country.name,
    }));
    //sort by name
    countries.sort((a, b) => a.name.localeCompare(b.name));
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "countries_fetched_successfully",
      data: countries,
    });
  } else {
    return sendResponse({
      res,
      statusCode: 500,
      translationKey: "error_reading_countries_data",
    });
  }
};

// Controller method to get states by country ID
const getStatesByCountryId = (req, res) => {
  const countryId = parseInt(req.params.countryId);
  const country = countriesData.find((country) => country.id === countryId);

  //sort states by name
  if (country && country.states) {
    country.states.sort((a, b) => a.name.localeCompare(b.name));
  }

  if (country) {
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "states_fetched_successfully",
      data: country.states || [],
    });
  } else {
    return sendResponse({
      res,
      statusCode: 404,
      translateMessage: false,
      translationKey: "country_not_found",
    });
  }
};

// Controller method to get cities by state ID
const getCitiesByStateId = (req, res) => {
  const stateId = parseInt(req.params.stateId);
  let state;

  countriesData.forEach((country) => {
    const foundState = country.states.find((state) => state.id === stateId);
    if (foundState) {
      state = foundState;
    }
  });

  if (state) {
    //sort cities by name
    if (state.cities) {
      state.cities.sort((a, b) => a.name.localeCompare(b.name));
    }
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "cities_fetched_successfully",
      data: state.cities || [],
    });
  } else {
    return sendResponse({
      res,
      statusCode: 404,
      translateMessage: false,
      translationKey: "state_not_found",
    });
  }
};

const getCitiesByCountryId = (req, res) => {
  const countryId = parseInt(req.params.countryId);
  const country = countriesData.find((country) => country.id === countryId);

  if (country) {
    const cities = country.states.reduce((acc, state) => {
      return acc.concat(state.cities || []);
    }, []);
    //sort cities by name
    cities.sort((a, b) => a.name.localeCompare(b.name));
    return sendResponse({
      res,
      statusCode: 200,
      translationKey: "cities_fetched_successfully",
      data: cities,
    });
  } else {
    return sendResponse({
      res,
      statusCode: 404,
      translationKey: "country_not_found",
    });
  }
};

const getNearbyCities = (req, res) => {
  let { latitude, longitude } = req.query;

  if (!latitude || !longitude) {
    return sendResponse({
      res,
      statusCode: 400,
      translationKey: "latitude_and_longitude_required",
    });
  }

  latitude = parseFloat(latitude);
  longitude = parseFloat(longitude);

  // Helper to calculate distance (Haversine) in kilometers, rounded to 2 decimals
  const getDistance = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const straightLine = R * c;

    // Apply road-distance multiplier (approx)
    const drivingApprox = straightLine * 1.2;

    return Math.round(drivingApprox * 100) / 100; // km, 2 decimals
  };



  // Flatten all cities
  const allCities = countriesData.flatMap((country) =>
    (country.states || []).flatMap((state) =>
      (state.cities || []).map((city) => ({
        id: city.id,
        name: city.name,
        latitude: parseFloat(city.latitude),
        longitude: parseFloat(city.longitude),
        country: country.name,
        countryId: country.id,
        state: state.name,
      }))
    )
  );

  // Step 1: Find nearest city overall — to identify which country we're in
  const nearestCity = allCities
    .map((city) => ({
      ...city,
      distance: getDistance(latitude, longitude, city.latitude, city.longitude),
    }))
    .sort((a, b) => a.distance - b.distance)[0];

  if (!nearestCity) {
    return sendResponse({
      res,
      statusCode: 404,
      translationKey: "no_nearby_cities_found",
    });
  }

  // Step 2: Filter all cities from the same country
  const sameCountryCities = allCities.filter(
    (city) => city.countryId === nearestCity.countryId
  );

  // Step 3: Sort by distance and return top 10 (excluding the nearest city itself)
  const nearbyCities = sameCountryCities
    .map((city) => ({
      ...city,
      distance: getDistance(latitude, longitude, city.latitude, city.longitude),
    }))
    .filter((city) => city.distance > 0.1) // exclude the given location itself
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 10);

  //split first 5 as nearby and rest as suggested
  const nearbyCitiesFinal = nearbyCities.slice(0, 5);
  const suggestedCities = nearbyCities.slice(5);

  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "nearby_cities_fetched_successfully",
    data: { nearbyCities: nearbyCitiesFinal, suggestedCities },
  });
};

module.exports = {
  getCountries,
  getStatesByCountryId,
  getCitiesByStateId,
  getCitiesByCountryId,
  getNearbyCities
};
