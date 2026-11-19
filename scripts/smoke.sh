#!/usr/bin/env bash
# Guest and owner scenario against a running service: create an event type,
# book its first free slot, see the booking in the owner list, get 409 on an overlapping booking.
# Usage: scripts/smoke.sh https://example.onrender.com
set -euo pipefail
base=${1:?usage: scripts/smoke.sh BASE_URL}
id="smoke-$(date +%s)"
json='Content-Type: application/json'

curl -fsS "$base/api/health"; echo
curl -fsS -X POST "$base/api/event-types" -H "$json" \
  -d "{\"id\":\"$id\",\"title\":\"Smoke $id\",\"description\":\"Smoke test\",\"durationMinutes\":30}"; echo
start=$(curl -fsS "$base/api/event-types/$id/slots" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0))[0].start)')
body="{\"eventTypeId\":\"$id\",\"start\":\"$start\",\"guestName\":\"Smoke Guest\",\"guestEmail\":\"guest@example.com\"}"

curl -fsS -X POST "$base/api/bookings" -H "$json" -d "$body"; echo
curl -fsS "$base/api/bookings" | grep -q "\"eventTypeId\":\"$id\"" && echo "owner list: booking found"
code=$(curl -sS -o /dev/null -w '%{http_code}' -X POST "$base/api/bookings" -H "$json" -d "$body")
[ "$code" = 409 ] && echo "repeat booking: 409 conflict" || { echo "repeat booking: expected 409, got $code"; exit 1; }
