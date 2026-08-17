#!/usr/bin/env bash
#
# Bring the development database up.
#
# Docker Desktop does not survive a restart of the machine, and neither does
# the container. When it is down every page that reads a venue returns 500 and
# the log shows a PrismaClientKnownRequestError with an empty message, which
# reads like a schema fault rather than what it is: nothing listening on the
# port. This script exists so that recovery is one command instead of a
# diagnosis.
#
# Run:  pnpm db:up
set -euo pipefail

CONTAINER="playhouse-db"
IMAGE="postgres:17-alpine"
PORT="55432"

if ! docker info >/dev/null 2>&1; then
  echo "Docker is not running. Starting it…"
  open -a Docker
  for _ in $(seq 1 60); do
    docker info >/dev/null 2>&1 && break
    sleep 3
  done
  docker info >/dev/null 2>&1 || {
    echo "Docker did not start within three minutes. Start Docker Desktop and try again." >&2
    exit 1
  }
fi

created=false
if ! docker ps -a --format '{{.Names}}' | grep -qx "$CONTAINER"; then
  # No container at all, so this is a fresh machine or the container was
  # removed. A named volume is used here, unlike the original anonymous one,
  # so that the data outlives the container from now on.
  echo "No $CONTAINER container found. Creating one…"
  docker run -d --name "$CONTAINER" \
    -e POSTGRES_USER=playhouse \
    -e POSTGRES_PASSWORD=playhouse \
    -e POSTGRES_DB=playhouse \
    -p "$PORT:5432" \
    -v playhouse-db-data:/var/lib/postgresql/data \
    "$IMAGE" >/dev/null
  created=true
else
  docker start "$CONTAINER" >/dev/null
fi

printf "Waiting for Postgres"
for _ in $(seq 1 45); do
  if docker exec "$CONTAINER" pg_isready -U playhouse -d playhouse >/dev/null 2>&1; then
    echo " — ready on localhost:$PORT"
    break
  fi
  printf "."
  sleep 2
done

docker exec "$CONTAINER" pg_isready -U playhouse -d playhouse >/dev/null 2>&1 || {
  echo
  echo "Postgres did not become ready. Check: docker logs $CONTAINER" >&2
  exit 1
}

if [ "$created" = true ]; then
  echo
  echo "This is an empty database. Populate it with:"
  echo "  pnpm exec prisma migrate deploy && pnpm db:seed"
fi
