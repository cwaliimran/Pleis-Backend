const fs = require("fs");
const path = require("path");
const { sendResponse } = require("../../helperUtils/responseUtil");

const Organizations = require("@OrganizationModel");
const { calculateDistance } = require("../../helperUtils/calculateDistance");

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


/* 
All organizations whose coordinates fall within the same GRID_KM × GRID_KM square are treated as one city cluster.
*/
const GRID_KM = 20; // cluster size in km

// ---- Helpers ----
const kmToLatDegrees = (km) => km / 111;

const kmToLngDegrees = (km, latitude) =>
  km / (111 * Math.cos((latitude * Math.PI) / 180));

const buildGridKey = ([lng, lat]) => {
  const latDeg = kmToLatDegrees(GRID_KM);
  const lngDeg = kmToLngDegrees(GRID_KM, lat);

  const latKey = Math.floor(lat / latDeg);
  const lngKey = Math.floor(lng / lngDeg);

  return `${latKey}:${lngKey}`;
};

// ---- Controller ----
const getNearbyCities = async (req, res) => {
  let { latitude, longitude } = req.query;

  const hasCoords =
    latitude !== undefined &&
    longitude !== undefined &&
    !isNaN(latitude) &&
    !isNaN(longitude);

  if (hasCoords) {
    latitude = parseFloat(latitude);
    longitude = parseFloat(longitude);
  }

  // 1️⃣ Fetch all active organizations with valid coordinates
  const organizations = await Organizations.find({
    status: "active",
    "location.coordinates.0": { $exists: true },
    "location.coordinates.1": { $exists: true },
  })
    .select("location.coordinates location.city location.country")
    .lean();

  if (!organizations.length) {
    return sendResponse({
      res,
      statusCode: 404,
      translationKey: "no_active_locations_found",
    });
  }

  // 2️⃣ Cluster organizations into geo-cells (≈ cities)
  const clusters = new Map();

  for (const org of organizations) {
    const coords = org.location.coordinates; // [lng, lat]
    if (!Array.isArray(coords) || coords.length !== 2) continue;

    const key = buildGridKey(coords);

    if (!clusters.has(key)) {
      clusters.set(key, {
        coordinates: coords, // still [lng, lat]
        city: org.location.city || null,
        country: org.location.country || null,
        count: 0,
      });
    }

    clusters.get(key).count += 1;
  }

  let cities = Array.from(clusters.values());

  // 3️⃣ If user location exists → rank by distance + density
  if (hasCoords) {
    cities = cities
      .map((c) => {
        const [lng, lat] = c.coordinates;

        const { distanceKm } = calculateDistance(
          latitude,
          longitude,
          lat,
          lng
        );

        const safeDistance = distanceKm ?? Number.MAX_SAFE_INTEGER;
        const rawScore = c.count / Math.max(safeDistance, 1);

        return {
          city: c.city,
          country: c.country,
          latitude: lat,
          longitude: lng,
          organizers: c.count,
          distanceKm: distanceKm !== null ? Number(distanceKm.toFixed(2)) : null,
          score: Number(rawScore.toFixed(2)),
        };
      })
      .sort((a, b) => {
        // Primary: score
        if (b.score !== a.score) return b.score - a.score;
        // Secondary: closer distance
        return (a.distanceKm ?? Infinity) - (b.distanceKm ?? Infinity);
      });
  }
  // 4️⃣ No user location → return most crowded places
  else {
    cities = cities
      .map((c) => {
        const [lng, lat] = c.coordinates;

        return {
          city: c.city,
          country: c.country,
          latitude: lat,
          longitude: lng,
          organizers: c.count,
          distanceKm: null,
          score: Number(c.count.toFixed(2)),
        };
      })
      .sort((a, b) => b.organizers - a.organizers);
  }

  // 5️⃣ Split response
  const nearbyCities = cities.slice(0, 5);
  const suggestedCities = cities.slice(5, 10);

  return sendResponse({
    res,
    statusCode: 200,
    translationKey: "nearby_cities_fetched_successfully",
    data: {
      nearbyCities,
      suggestedCities,
    },
  });
};


module.exports = {
  getCountries,
  getStatesByCountryId,
  getCitiesByStateId,
  getCitiesByCountryId,
  getNearbyCities
};
