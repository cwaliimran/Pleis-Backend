/**
 * Rate-limit probe — one client hammers a limited endpoint until 429.
 * Validates limiter is alive and returns CORS-safe 429 (not 5xx).
 *
 * Login limit is 20 / 15 min per client → expect 429 after ~20 posts.
 *
 *   k6 run k6/rate-limit.js
 *   BASE_URL=http://127.0.0.1:3000 k6 run --vus 1 --iterations 40 k6/rate-limit.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { baseUrl, jsonHeaders, loginPayload } from "./lib/helpers.js";

const got429 = new Counter("probe_429");
const gotOther = new Counter("probe_other");

export const options = {
  vus: Number(__ENV.VUS || 1),
  iterations: Number(__ENV.ITERATIONS || 40),
  thresholds: {
    // At least some 429s when hammering from one IP
    probe_429: ["count>0"],
  },
};

export default function () {
  const res = http.post(
    `${baseUrl()}/api/v1/auth/login`,
    loginPayload({ email: `ratelimit+vu${__VU}@example.com` }),
    jsonHeaders(),
  );

  if (res.status === 429) {
    got429.add(1);
    check(res, {
      "429 has body": (r) => !!r.body,
      "Retry-After or RateLimit header": (r) =>
        !!(
          r.headers["Retry-After"] ||
          r.headers["RateLimit-Limit"] ||
          r.headers["Ratelimit-Limit"]
        ),
    });
  } else {
    gotOther.add(1);
    check(res, {
      "pre-limit response ok-ish": (r) =>
        [400, 401, 404, 403].includes(r.status),
    });
  }

  sleep(Number(__ENV.THINK || 0.05));
}
