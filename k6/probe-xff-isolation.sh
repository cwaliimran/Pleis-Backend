#!/usr/bin/env bash
# Prove X-Forwarded-For is honored (trust proxy) before k6 isolation run.
set -euo pipefail
BASE="${BASE_URL:-http://127.0.0.1:4020}"
body='{"email":"xff-probe@example.com","password":"WrongPassword123!","deviceId":"probe","deviceType":"ios","timezone":"UTC","userType":"user"}'

echo "Probing trust-proxy IP isolation at $BASE"
for ip in 203.0.113.10 198.51.100.20 192.0.2.30; do
  code=$(curl -sS -o /tmp/xff_body.json -w '%{http_code}' \
    -X POST "$BASE/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -H "X-Forwarded-For: $ip" \
    -d "$body")
  echo "IP=$ip -> HTTP $code"
done

echo "Hammering attacker IP 25x to approach login limit (20/15m)..."
for i in $(seq 1 25); do
  code=$(curl -sS -o /dev/null -w '%{http_code}' \
    -X POST "$BASE/api/v1/auth/login" \
    -H 'Content-Type: application/json' \
    -H 'X-Forwarded-For: 203.0.113.10' \
    -d "$body")
  echo -n "$code "
done
echo
echo "Victim IP after attacker flood:"
code=$(curl -sS -o /tmp/xff_victim.json -w '%{http_code}' \
  -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -H 'X-Forwarded-For: 198.51.100.20' \
  -d "$body")
echo "victim IP=198.51.100.20 -> HTTP $code (expect 401/404, NOT 429)"
code2=$(curl -sS -o /tmp/xff_attacker.json -w '%{http_code}' \
  -X POST "$BASE/api/v1/auth/login" \
  -H 'Content-Type: application/json' \
  -H 'X-Forwarded-For: 203.0.113.10' \
  -d "$body")
echo "attacker IP=203.0.113.10 -> HTTP $code2 (expect 429 if limiter works)"
