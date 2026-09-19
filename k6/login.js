/**
 * Login flood — intentional failed logins to exercise:
 *   - per-route login rate limit (20 / 15m)
 *   - global rate limit
 *   - IpThreat failed_login logging / auto-block
 *
 * WARNING: Can auto-block your runner IP on prodtest/prod.
 * Prefer BASE_URL pointing at local/staging, or whitelist your IP first.
 *
 *   PROFILE=smoke k6 run k6/login.js
 *   LOGIN_EMAIL=you@pleis.com LOGIN_PASSWORD=secret PROFILE=load k6 run k6/login.js
 *
 * Set EXPECT_SUCCESS=true only when credentials are valid (measures happy path).
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";
import {
  baseUrl,
  jsonHeaders,
  loginPayload,
  stagesFromEnv,
  fakeUser,
} from "./lib/helpers.js";

const status429 = new Counter("login_429");
const status401 = new Counter("login_401_or_404");
const status200 = new Counter("login_200");
const failRate = new Rate("login_unexpected_fail");

export const options = {
  stages: stagesFromEnv(__ENV.PROFILE || "smoke"),
  thresholds: {
    // Login under attack should mostly be 401/404/429 — not 5xx
    // k6 counts non-2xx as http_req_failed; we use custom checks instead
    login_unexpected_fail: ["rate<0.05"],
  },
};

export default function () {
  const expectSuccess = __ENV.EXPECT_SUCCESS === "true";
  const body = expectSuccess
    ? loginPayload({
        email: __ENV.LOGIN_EMAIL,
        password: __ENV.LOGIN_PASSWORD,
        deviceId: `k6-ok-vu${__VU}`,
      })
    : loginPayload(fakeUser(__VU, __ITER));

  const res = http.post(
    `${baseUrl()}/api/v1/auth/login`,
    body,
    jsonHeaders(),
  );

  if (res.status === 200) status200.add(1);
  else if (res.status === 429) status429.add(1);
  else if (res.status === 401 || res.status === 404) status401.add(1);

  const ok = check(res, {
    "not 5xx": (r) => r.status < 500,
    "expected auth outcome": (r) => {
      if (expectSuccess) return r.status === 200 || r.status === 429;
      return [401, 404, 400, 429, 403].includes(r.status);
    },
  });
  failRate.add(!ok);
  sleep(Number(__ENV.THINK || 0.3));
}
