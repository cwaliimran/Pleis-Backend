/**
 * Authenticated mixed journey load (guest browse + admin lists).
 * Tokens are obtained in setup() via bootstrap creds from env.
 *
 *   BASE_URL=http://127.0.0.1:4020 PROFILE=load ./tmp/k6 run k6/system/authenticated-journey.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Counter } from "k6/metrics";
import { baseUrl, stagesFromEnv, jsonHeaders } from "../lib/helpers.js";

const fail = new Rate("journey_fail");
const c429 = new Counter("journey_429");
const c5xx = new Counter("journey_5xx");

export const options = {
  stages: stagesFromEnv(__ENV.PROFILE || "load"),
  thresholds: {
    journey_fail: ["rate<0.08"],
    journey_5xx: ["count==0"],
    http_req_duration: ["p(95)<3000"],
  },
};

function login(userType, email, password, adminHeader) {
  const headers = {
    ...jsonHeaders().headers,
    "X-Forwarded-For": `203.0.113.${50 + (__VU % 100)}`,
  };
  if (adminHeader) headers["x-admin-access-token"] = adminHeader;
  const res = http.post(
    `${baseUrl()}/api/v1/auth/login`,
    JSON.stringify({
      email,
      password,
      userType,
      deviceType: "web",
      deviceId: `k6-journey-${userType}-${__VU}`,
      timezone: "UTC",
    }),
    { headers },
  );
  if (res.status !== 200) return null;
  try {
    return res.json()?.data?.token || null;
  } catch (_) {
    return null;
  }
}

export function setup() {
  // setup runs once — use VU 0 style headers
  const adminEmail = __ENV.BOOTSTRAP_ADMIN_EMAIL;
  const adminPass = __ENV.BOOTSTRAP_ADMIN_PASSWORD;
  const guestEmail = __ENV.BOOTSTRAP_GUEST_EMAIL;
  const guestPass = __ENV.BOOTSTRAP_GUEST_PASSWORD;
  const adminTok = __ENV.ADMIN_ACCESS_TOKEN || "";

  const adminHeaders = {
    "Content-Type": "application/json",
    "X-Timezone": "UTC",
    "X-Forwarded-For": "203.0.113.9",
    "x-admin-access-token": adminTok,
  };
  const guestHeaders = {
    "Content-Type": "application/json",
    "X-Timezone": "UTC",
    "X-Forwarded-For": "203.0.113.8",
  };

  const adminRes = http.post(
    `${baseUrl()}/api/v1/auth/login`,
    JSON.stringify({
      email: adminEmail,
      password: adminPass,
      userType: "admin",
      deviceType: "web",
      deviceId: "k6-setup-admin",
      timezone: "UTC",
    }),
    { headers: adminHeaders },
  );
  const guestRes = http.post(
    `${baseUrl()}/api/v1/auth/login`,
    JSON.stringify({
      email: guestEmail,
      password: guestPass,
      userType: "guest",
      deviceType: "web",
      deviceId: "k6-setup-guest",
      timezone: "UTC",
    }),
    { headers: guestHeaders },
  );

  const adminToken = adminRes.json()?.data?.token;
  const guestToken = guestRes.json()?.data?.token;
  if (!adminToken || !guestToken) {
    throw new Error(
      `setup login failed admin=${adminRes.status} guest=${guestRes.status}`,
    );
  }

  // discover an org id
  const orgs = http.get(`${baseUrl()}/api/v1/admin/organizations?page=1&limit=5`, {
    headers: { Authorization: `Bearer ${adminToken}`, "X-Timezone": "UTC" },
  });
  let orgId = null;
  try {
    const data = orgs.json()?.data;
    const list = Array.isArray(data) ? data : data?.docs || [];
    orgId = list[0]?._id || null;
  } catch (_) {}

  return { adminToken, guestToken, orgId };
}

export default function (data) {
  const roll = Math.random();
  let res;
  const guestH = {
    headers: {
      Authorization: `Bearer ${data.guestToken}`,
      "X-Timezone": "UTC",
      "X-Forwarded-For": `198.51.100.${(__VU % 200) + 20}`,
    },
  };
  const adminH = {
    headers: {
      Authorization: `Bearer ${data.adminToken}`,
      "X-Timezone": "UTC",
      "X-Forwarded-For": `192.0.2.${(__VU % 200) + 20}`,
    },
  };

  if (roll < 0.12) {
    res = http.get(`${baseUrl()}/health`);
  } else if (roll < 0.25) {
    res = http.get(`${baseUrl()}/api/v1/locations/countries`);
  } else if (roll < 0.4) {
    res = http.get(
      `${baseUrl()}/api/v1/app/organizations/nearby?radiusKm=500&latitude=45.815&longitude=15.982&page=1&limit=5`,
      guestH,
    );
  } else if (roll < 0.55) {
    res = http.post(
      `${baseUrl()}/api/v1/app/popular-events?latitude=45.815&longitude=15.982&radiusKm=50&page=1&limit=5`,
      "{}",
      { ...guestH, headers: { ...guestH.headers, "Content-Type": "application/json" } },
    );
  } else if (roll < 0.7) {
    res = http.get(`${baseUrl()}/api/v1/admin/organizations?page=1&limit=10`, adminH);
  } else if (roll < 0.82) {
    res = http.get(`${baseUrl()}/api/v1/admin/venues?page=1&limit=10`, adminH);
  } else if (roll < 0.92) {
    res = http.get(`${baseUrl()}/api/v1/admin/users?page=1&limit=10`, adminH);
  } else if (data.orgId) {
    res = http.get(
      `${baseUrl()}/api/v1/app/menu/items?organization=${data.orgId}&page=1&limit=10`,
      guestH,
    );
  } else {
    res = http.get(`${baseUrl()}/api/v1/settings/faqs`);
  }

  if (res.status === 429) c429.add(1);
  if (res.status >= 500) c5xx.add(1);

  const ok = check(res, {
    "not 5xx": (r) => r.status < 500,
    "got response": (r) => r.status > 0,
  });
  fail.add(!ok);
  sleep(Number(__ENV.THINK || 0.35));
}
