#!/bin/sh
# Merges our own circuits (mounted at .../circuits/kids) into the "Circuits" menu.
# Runs on every container start, so `docker compose restart` picks up menu changes.
set -e
DIR=/usr/share/nginx/html/circuitjs1
MENU="$DIR/circuits/kids/menu.txt"
{
  echo "### setuplist.txt first line must be a comment"
  if [ -f "$MENU" ]; then
    grep -v '^#' "$MENU" | sed 's/\r$//'
  fi
  # Our menu picks the circuit that opens on start (">" marker), so drop the stock one.
  tail -n +2 "$DIR/setuplist.orig.txt" | sed 's/^>//'
} > "$DIR/setuplist.txt"
echo "kids-menu: merged $MENU into setuplist.txt"
