/**
 * Multi-country / multi-user rate-limit ISOLATION test.
 *
 * Simulates clients from different regions by sending distinct
 * X-Forwarded-For IPs (works because server has trust proxy set).
 *
 * Attacker = one IP hammers login past limit → expects 429
 * Victims = other "countries/users" with different IPs → must NOT get 429
 *
 *   BASE_URL=http://127.0.0.1:4020 ./tmp/k6 run k6/rate-limit-isolation.js
 */
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";
import { baseUrl, loginPayload } from "./lib/helpers.js";

const RUN = String(__ENV.RUN_ID || Date.now()).slice(-3);
const octet = (n) => 10 + (Number(RUN) % 200) + n;

const ATTACKER = { ip: `203.0.113.${octet(0)}`, country: "US-attacker" };
const VICTIMS = [
  { ip: `198.51.100.${octet(1)}`, country: "DE-user" },
  { ip: `192.0.2.${octet(2)}`, country: "PK-user" },
  { ip: `203.0.113.${octet(3)}`, country: "GB-user" },
  { ip: `198.51.100.${octet(4)}`, country: "FR-user" },
  { ip: `192.0.2.${octet(5)}`, country: "AE-user" },
];

// Log once so the report shows which IPs were used
export function setup() {
  console.log(`RUN_ID=${RUN} attacker=${ATTACKER.ip}`);
  VICTIMS.forEach((v) => console.log(`victim ${v.country}=${v.ip}`));
  return { attacker: ATTACKER, victims: VICTIMS };
}

const attacker429 = new Counter("attacker_429");
const attackerOk = new Counter("attacker_pre_limit");
const victim429 = new Counter("victim_429");
const victimOk = new Counter("victim_ok");
const isolationFail = new Rate("isolation_fail");

const ATTACKER_ITERS = Number(__ENV.ATTACKER_ITERS || 35); // login limit is 20/15m
const VICTIM_ITERS = Number(__ENV.VICTIM_ITERS || 8);

export const options = {
  scenarios: {
    attacker: {
      executor: "per-vu-iterations",
      vus: 1,
      iterations: ATTACKER_ITERS,
      exec: "attackerScenario",
      maxDuration: "3m",
      tags: { role: "attacker" },
    },
    victims: {
      executor: "per-vu-iterations",
      vus: VICTIMS.length,
      iterations: VICTIM_ITERS,
      exec: "victimScenario",
      startTime: "3s",
      maxDuration: "3m",
      tags: { role: "victim" },
    },
  },
  thresholds: {
    victim_429: ["count==0"],
    isolation_fail: ["rate==0"],
    attacker_429: ["count>0"],
  },
};

function headersFor(client, role) {
  return {
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "X-Timezone": "UTC",
      "X-Forwarded-For": client.ip,
    },
    tags: { country: client.country, client_ip: client.ip, role },
  };
}

function postLogin(client, role) {
  const body = loginPayload({
    email: `iso+${client.country.replace(/[^a-z0-9]/gi, "")}@example.com`,
    deviceId: `k6-${client.country}`,
  });
  return http.post(
    `${baseUrl()}/api/v1/auth/login`,
    body,
    headersFor(client, role),
  );
}

export function attackerScenario(data) {
  const attacker = data?.attacker || ATTACKER;
  const res = postLogin(attacker, "attacker");

  if (res.status === 429) attacker429.add(1);
  else attackerOk.add(1);

  const ok = check(res, {
    "attacker: got response": (r) => r.status > 0,
    "attacker: not 5xx": (r) => r.status > 0 && r.status < 500,
    "attacker: 401/404/400/429": (r) =>
      [400, 401, 404, 429, 403].includes(r.status),
  });
  isolationFail.add(!ok);
  sleep(0.08);
}

export function victimScenario(data) {
  const victims = data?.victims || VICTIMS;
  const client = victims[(__VU - 1) % victims.length];
  const res = postLogin(client, "victim");

  if (res.status === 429) {
    victim429.add(1);
    isolationFail.add(1);
  } else if (res.status > 0) {
    victimOk.add(1);
    isolationFail.add(0);
  } else {
    isolationFail.add(1);
  }

  check(res, {
    "victim: got response": (r) => r.status > 0,
    "victim: not 5xx": (r) => r.status > 0 && r.status < 500,
    "victim: NOT rate-limited by attacker": (r) => r.status !== 429,
    "victim: normal auth failure": (r) =>
      [400, 401, 404, 403].includes(r.status),
  });
  sleep(0.2);
}
