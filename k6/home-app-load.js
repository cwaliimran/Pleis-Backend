/**
 * Authenticated home / search / maps load test (app user journey).
 *
 *   BASE_URL=https://…azurewebsites.net \
 *   AUTH_TOKEN=<jwt> PROFILE=load RAMP_VUS=100 HOLD=2m \
 *   ./tmp/k6 run k6/home-app-load.js
 *
 * Or with bootstrap guest:
 *   BOOTSTRAP_GUEST_EMAIL=… BOOTSTRAP_GUEST_PASSWORD=… PROFILE=load RAMP_VUS=100 \
 *   ./tmp/k6 run k6/home-app-load.js
 *
 * Geo note: this Azure dev DB has little Zagreb data — default lat/lng is global 0,0
 * for home/search; maps uses Lahore-ish bounds where Near You samples live.
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Counter, Trend } from "k6/metrics";
import { baseUrl, stagesFromEnv, jsonHeaders } from "./lib/helpers.js";

const failRate = new Rate("home_fail_rate");
const c429 = new Counter("home_429");
const c5xx = new Counter("home_5xx");
const homeDur = new Trend("home_duration", true);
const filtersDur = new Trend("filters_duration", true);
const searchDur = new Trend("search_duration", true);
const searchFkDur = new Trend("search_filterKey_duration", true);
const mapsDur = new Trend("maps_duration", true);

export const options = {
  stages: stagesFromEnv(__ENV.PROFILE || "load"),
  thresholds: {
    home_fail_rate: ["rate<0.08"],
    home_5xx: ["count==0"],
    http_req_duration: ["p(95)<5000"],
  },
};

const LAT = __ENV.LAT || "0";
const LNG = __ENV.LNG || "0";
// Lahore area — matches Near You samples on this Azure DB
const MAP_BOUNDS = JSON.stringify({
  northEast: { latitude: 32.0, longitude: 75.0 },
  southWest: { latitude: 31.0, longitude: 74.0 },
});

function authHeaders(token) {
  return {
    headers: {
      ...jsonHeaders().headers,
      Authorization: `Bearer ${token}`,
      "X-Forwarded-For": `198.51.100.${(__VU % 200) + 10}`,
    },
  };
}

export function setup() {
  if (__ENV.AUTH_TOKEN) {
    return { token: __ENV.AUTH_TOKEN, filterKey: "nearYouOrganizations" };
  }

  const email = __ENV.BOOTSTRAP_GUEST_EMAIL;
  const password = __ENV.BOOTSTRAP_GUEST_PASSWORD;
  if (!email || !password) {
    throw new Error("Provide AUTH_TOKEN or BOOTSTRAP_GUEST_EMAIL/PASSWORD");
  }

  const res = http.post(
    `${baseUrl()}/api/v1/auth/login`,
    JSON.stringify({
      email,
      password,
      userType: "guest",
      deviceType: "ios",
      deviceId: "k6-home-setup",
      timezone: "UTC",
    }),
    jsonHeaders()
  );
  const token = res.json()?.data?.token;
  if (!token) {
    throw new Error(`guest login failed status=${res.status}`);
  }

  // Discover a dynamic tag filterKey from home (global)
  let filterKey = "nearYouOrganizations";
  const home = http.post(
    `${baseUrl()}/api/v1/app/home?latitude=${LAT}&longitude=${LNG}`,
    "{}",
    {
      headers: {
        ...jsonHeaders().headers,
        Authorization: `Bearer ${token}`,
      },
    }
  );
  try {
    const sections = home.json()?.data || [];
    const tag = sections.find(
      (s) => s.key === "customCategoryByTags" && s.filterKey
    );
    if (tag?.filterKey) filterKey = tag.filterKey;
  } catch (_) {}

  return { token, filterKey };
}

export default function (data) {
  const h = authHeaders(data.token);
  const roll = Math.random();
  let res;
  let trend = null;

  if (roll < 0.35) {
    // Home feed (heaviest)
    res = http.post(
      `${baseUrl()}/api/v1/app/home?latitude=${LAT}&longitude=${LNG}`,
      "{}",
      h
    );
    trend = homeDur;
  } else if (roll < 0.5) {
    res = http.post(
      `${baseUrl()}/api/v1/app/home/global/filters?latitude=${LAT}&longitude=${LNG}&radiusKm=50`,
      "{}",
      h
    );
    trend = filtersDur;
  } else if (roll < 0.65) {
    res = http.post(
      `${baseUrl()}/api/v1/app/home/global/search?latitude=${LAT}&longitude=${LNG}&page=1&limit=10&keyword=a&type=all`,
      JSON.stringify({ sort: "desc", advanceFilters: {} }),
      h
    );
    trend = searchDur;
  } else if (roll < 0.8) {
    const fk = encodeURIComponent(data.filterKey || "nearYouOrganizations");
    res = http.post(
      `${baseUrl()}/api/v1/app/home/global/search?latitude=${LAT}&longitude=${LNG}&page=1&limit=10&filterKey=${fk}`,
      "{}",
      h
    );
    trend = searchFkDur;
  } else {
    res = http.post(
      `${baseUrl()}/api/v1/app/maps`,
      JSON.stringify({
        filter: { type: Math.random() < 0.7 ? "places" : "all" },
        bounds: JSON.parse(MAP_BOUNDS),
        advanceFilters: {},
      }),
      h
    );
    trend = mapsDur;
  }

  if (trend) trend.add(res.timings.duration);
  if (res.status === 429) c429.add(1);
  if (res.status >= 500) c5xx.add(1);

  const ok = check(res, {
    "status 2xx": (r) => r.status >= 200 && r.status < 300,
    "not 5xx": (r) => r.status < 500,
  });
  failRate.add(!ok);
  sleep(Number(__ENV.THINK || 0.35));
}
