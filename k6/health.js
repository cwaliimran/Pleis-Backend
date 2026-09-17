/**
 * Baseline capacity — health + root only (almost no DB).
 *
 *   k6 run k6/health.js
 *   BASE_URL=http://127.0.0.1:3000 PROFILE=stress k6 run k6/health.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Rate, Trend } from "k6/metrics";
import { baseUrl, stagesFromEnv } from "./lib/helpers.js";

const failRate = new Rate("health_fail_rate");
const latency = new Trend("health_latency", true);

export const options = {
  stages: stagesFromEnv(),
  thresholds: {
    health_fail_rate: ["rate<0.01"],
    http_req_duration: ["p(95)<500"],
  },
};

export default function () {
  const url = `${baseUrl()}/health`;
  const res = http.get(url);
  latency.add(res.timings.duration);
  const ok = check(res, {
    "health 200": (r) => r.status === 200,
  });
  failRate.add(!ok);
  sleep(Number(__ENV.THINK || 0.2));
}
