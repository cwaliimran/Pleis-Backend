/**
 * Shared k6 helpers for Pleis API load tests.
 * k6 uses its own JS runtime — only k6 APIs + relative imports.
 */
export function baseUrl() {
  return (__ENV.BASE_URL || "http://127.0.0.1:3000").replace(/\/$/, "");
}

export function jsonHeaders(extra = {}) {
  return {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Timezone": __ENV.TIMEZONE || "UTC",
      ...extra,
    },
  };
}

/** Unique fake identity per VU — does not change source IP. */
export function fakeUser(vu = __VU, iter = __ITER) {
  return {
    email: `loadtest+vu${vu}.i${iter}@example.com`,
    password: __ENV.LOGIN_PASSWORD || "WrongPassword123!",
    deviceId: `k6-device-vu${vu}`,
    deviceType: "ios",
    timezone: __ENV.TIMEZONE || "UTC",
    userType: __ENV.USER_TYPE || "user",
  };
}

export function loginPayload(overrides = {}) {
  return JSON.stringify({ ...fakeUser(), ...overrides });
}

/**
 * Stages from env:
 *   RAMP_VUS=50  HOLD=2m  RAMP_DOWN=30s
 * or PROFILE=smoke|load|stress|spike
 */
export function stagesFromEnv(profile = __ENV.PROFILE || "load") {
  const presets = {
    smoke: [
      { duration: "15s", target: 3 },
      { duration: "15s", target: 0 },
    ],
    ci: [
      { duration: "10s", target: 2 },
      { duration: "5s", target: 0 },
    ],
    load: [
      { duration: "1m", target: Number(__ENV.RAMP_VUS || 50) },
      { duration: __ENV.HOLD || "3m", target: Number(__ENV.RAMP_VUS || 50) },
      { duration: "1m", target: 0 },
    ],
    stress: [
      { duration: "2m", target: 100 },
      { duration: "3m", target: 250 },
      { duration: "2m", target: 400 },
      { duration: "2m", target: 0 },
    ],
    spike: [
      { duration: "10s", target: 20 },
      { duration: "30s", target: 300 },
      { duration: "1m", target: 300 },
      { duration: "30s", target: 0 },
    ],
  };
  return presets[profile] || presets.load;
}

export const publicGetPaths = [
  "/health",
  "/api",
  "/api/v1/settings/privacy-policy",
  "/api/v1/settings/terms-conditions",
  "/api/v1/settings/about-us",
  "/api/v1/settings/faqs",
  "/api/v1/settings/customer-terms-conditions",
  "/api/v1/locations/countries",
];
