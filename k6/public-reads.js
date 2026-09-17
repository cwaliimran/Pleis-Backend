/**
 * Public read traffic — settings + locations (hits DB / Redis).
 * Simulates many "users" via VU concurrency (same source IP locally).
 *
 *   PROFILE=smoke k6 run k6/public-reads.js
 *   PROFILE=load RAMP_VUS=80 k6 run k6/public-reads.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Counter } from "k6/metrics";
import {
  baseUrl,
  jsonHeaders,
  publicGetPaths,
  stagesFromEnv,
} from "./lib/helpers.js";

const failRate = new Rate("public_fail_rate");
const tooMany = new Counter("public_429");

export const options = {
  stages: stagesFromEnv(),
  thresholds: {
    // Allow a little noise; tighten after you know baseline
    public_fail_rate: ["rate<0.05"],
    http_req_duration: ["p(95)<2500"],
  },
};

export default function () {
  const path = publicGetPaths[Math.floor(Math.random() * publicGetPaths.length)];
  const res = http.get(`${baseUrl()}${path}`, jsonHeaders());

  if (res.status === 429) tooMany.add(1);

  const ok = check(res, {
    "not 5xx": (r) => r.status < 500,
    "2xx or 429": (r) =>
      (r.status >= 200 && r.status < 300) || r.status === 429,
  });
  failRate.add(!ok);
  sleep(Number(__ENV.THINK || 0.5));
}
