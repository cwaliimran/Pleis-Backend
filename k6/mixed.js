/**
 * Mixed traffic — health + public reads + occasional failed login.
 * Closest single-machine "many users" capacity check.
 *
 *   PROFILE=load RAMP_VUS=100 k6 run k6/mixed.js
 *   PROFILE=stress k6 run k6/mixed.js
 *
 * Multi-region (real different IPs/countries):
 *   k6 cloud run k6/mixed.js -e BASE_URL=https://your-api.example.com
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Counter } from "k6/metrics";
import {
  baseUrl,
  jsonHeaders,
  publicGetPaths,
  loginPayload,
  stagesFromEnv,
} from "./lib/helpers.js";

const failRate = new Rate("mixed_fail_rate");
const c429 = new Counter("mixed_429");

export const options = {
  stages: stagesFromEnv(),
  thresholds: {
    mixed_fail_rate: ["rate<0.05"],
    http_req_duration: ["p(95)<2500"],
  },
};

export default function () {
  const roll = Math.random();
  let res;

  if (roll < 0.15) {
    res = http.get(`${baseUrl()}/health`);
  } else if (roll < 0.85) {
    const path =
      publicGetPaths[Math.floor(Math.random() * publicGetPaths.length)];
    res = http.get(`${baseUrl()}${path}`, jsonHeaders());
  } else {
    res = http.post(
      `${baseUrl()}/api/v1/auth/login`,
      loginPayload(),
      jsonHeaders(),
    );
  }

  if (res.status === 429) c429.add(1);

  const ok = check(res, {
    "not 5xx": (r) => r.status < 500,
  });
  failRate.add(!ok);
  sleep(Number(__ENV.THINK || 0.4));
}
