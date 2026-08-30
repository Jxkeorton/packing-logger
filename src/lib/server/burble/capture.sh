#!/bin/sh
# Capture the Burble public manifest feed for a dropzone.
#
#   ./capture.sh                  # one snapshot to stdout
#   ./capture.sh out_dir 20 180   # snapshot into out_dir every 20s, 180 times
#
# Only exists to grab fixtures — see NOTES.md. The app's own polling should
# talk to the endpoint directly rather than shelling out to this.
set -eu

DZ_ID="${DZ_ID:-8494}"
HOST="https://eu-displays.burblesoft.com"
OUT_DIR="${1:-}"
INTERVAL="${2:-20}"
COUNT="${3:-1}"

COOKIES="$(mktemp)"
trap 'rm -f "$COOKIES"' EXIT

# The session cookie is what carries dz_id; without it the endpoint returns a
# decoy {"success":false,...} payload instead of loads.
bootstrap() {
  curl -sSL -c "$COOKIES" -o /dev/null "$HOST/jmp?dz_id=$DZ_ID"
}

get_loads() {
  curl -sS -b "$COOKIES" -X POST \
    "$HOST/ajax_dzm2_frontend_jumpermanifestpublic" \
    -d "action=getLoads&dz_id=$DZ_ID"
}

bootstrap

i=0
while [ "$i" -lt "$COUNT" ]; do
  body="$(get_loads || true)"
  # Session expired or was never valid — re-bootstrap and take one more run at it.
  case "$body" in
    *'"loads"'*) ;;
    *) bootstrap; body="$(get_loads || true)" ;;
  esac

  if [ -n "$OUT_DIR" ]; then
    mkdir -p "$OUT_DIR"
    printf '%s' "$body" > "$OUT_DIR/$(date -u +%Y%m%dT%H%M%SZ).json"
  else
    printf '%s\n' "$body"
  fi

  i=$((i + 1))
  [ "$i" -lt "$COUNT" ] && sleep "$INTERVAL"
done
