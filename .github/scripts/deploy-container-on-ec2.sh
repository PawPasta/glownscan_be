set -eu

IMAGE="__IMAGE__"
IMAGE_TAG="__IMAGE_TAG__"
NEW_IMAGE="$IMAGE:$IMAGE_TAG"
DOCKER_NETWORK="glownscan-net"
REDIS_CONTAINER="glownscan-redis"

cd /opt/glownscan

if [ ! -r /opt/glownscan/firebase-service-account.json ]; then
  echo "Firebase Admin service-account file is missing or unreadable."
  exit 1
fi

docker network inspect "$DOCKER_NETWORK" >/dev/null 2>&1 || \
  docker network create "$DOCKER_NETWORK"
docker volume create glownscan-redis-data >/dev/null

if ! docker container inspect "$REDIS_CONTAINER" >/dev/null 2>&1; then
  docker run -d \
    --name "$REDIS_CONTAINER" \
    --network "$DOCKER_NETWORK" \
    --network-alias redis \
    --restart unless-stopped \
    --mount source=glownscan-redis-data,target=/data \
    redis:7-alpine redis-server --appendonly yes
else
  docker network connect --alias redis "$DOCKER_NETWORK" "$REDIS_CONTAINER" 2>/dev/null || true
  docker start "$REDIS_CONTAINER" >/dev/null 2>&1 || true
fi

REDIS_READY=0
REDIS_ATTEMPT=0
while [ "$REDIS_ATTEMPT" -lt 30 ]; do
  if docker exec "$REDIS_CONTAINER" redis-cli ping 2>/dev/null | grep -q PONG; then
    REDIS_READY=1
    break
  fi
  REDIS_ATTEMPT=$((REDIS_ATTEMPT + 1))
  sleep 2
done
if [ "$REDIS_READY" -ne 1 ]; then
  echo "Redis did not become ready."
  docker logs --tail 100 "$REDIS_CONTAINER" 2>/dev/null || true
  exit 1
fi

PREVIOUS_IMAGE=""
if docker container inspect glownscan-api >/dev/null 2>&1; then
  PREVIOUS_IMAGE="$(docker inspect --format='{{.Config.Image}}' glownscan-api)"
fi

docker pull "$NEW_IMAGE"

# Migrations are forward-only expand changes. Do not attempt schema
# rollback when rolling the application image back.
docker run --rm \
  --env-file /opt/glownscan/.env \
  "$NEW_IMAGE" node database/migrate.js up

rollback() {
  echo "Deployment failed; attempting rollback."
  docker stop glownscan-api 2>/dev/null || true
  docker rm glownscan-api 2>/dev/null || true

  if [ -n "$PREVIOUS_IMAGE" ]; then
    docker run -d \
      --name glownscan-api \
      --restart unless-stopped \
      --network "$DOCKER_NETWORK" \
      --env-file /opt/glownscan/.env \
      --mount type=bind,src=/opt/glownscan/firebase-service-account.json,dst=/app/secrets/firebase-service-account.json,readonly \
      -p 127.0.0.1:3000:3000 \
      "$PREVIOUS_IMAGE"
  else
    echo "No previous image is available for rollback."
  fi
}

docker stop glownscan-api 2>/dev/null || true
docker rm glownscan-api 2>/dev/null || true

if ! docker run -d \
  --name glownscan-api \
  --restart unless-stopped \
  --network "$DOCKER_NETWORK" \
  --env-file /opt/glownscan/.env \
  --mount type=bind,src=/opt/glownscan/firebase-service-account.json,dst=/app/secrets/firebase-service-account.json,readonly \
  -p 127.0.0.1:3000:3000 \
  "$NEW_IMAGE"; then
  docker logs --tail 100 glownscan-api 2>/dev/null || true
  rollback
  exit 1
fi

HEALTHY=0
ATTEMPT=0

while [ "$ATTEMPT" -lt 30 ]; do
  if docker exec glownscan-api node -e \
    'fetch("http://127.0.0.1:3000/health/database").then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))'; then
    HEALTHY=1
    break
  fi

  ATTEMPT=$((ATTEMPT + 1))
  sleep 2
done

if [ "$HEALTHY" -ne 1 ]; then
  echo "Database health check failed."
  docker logs --tail 100 glownscan-api 2>/dev/null || true
  rollback
  exit 1
fi

docker image prune -f
echo "Deployment successful: $NEW_IMAGE"
