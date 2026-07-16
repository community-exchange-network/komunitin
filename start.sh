#!/usr/bin/env bash

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Migrate the databases and provision the configured superadmin. Use --up to
build and start the services first.

Options:
  --up          Build and start the services
  --demo        Reset the service databases and seed them with demo data
  --dev         Start with development config (requires --up)
  --public      Start with production config (requires --up)
  --no-prune    Keep unused Docker resources after startup
  -h, --help    Show this help message
EOF
}

demo=false
public=false
up=false
noprune=false
dev=false

while (( $# > 0 )); do
  case "$1" in
    --up)
      up=true
      ;;
    --demo)
      demo=true
      ;;
    --public)
      public=true
      ;;
    --dev)
      dev=true
      ;;
    --no-prune)
      noprune=true
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      echo >&2
      usage >&2
      exit 1
      ;;
  esac
  shift
done

if [ "$dev" = true ] && [ "$public" = true ]; then
  echo "Options --dev and --public cannot be used together." >&2
  exit 1
fi

if [ "$up" = false ] && { [ "$dev" = true ] || [ "$public" = true ] || [ "$noprune" = true ]; }; then
  echo "Options --dev, --public and --no-prune require --up." >&2
  exit 1
fi

# Load .env file.
set -a
. .env
set +a

# for social db, prisma reset does not work well so we remove the volume and let docker 
# compose recreate it.
if [ "$demo" = true  ]; then
  docker compose down -v db-social
fi


# Start the services
if [ "$up" = true ]; then
if [ "$public" = true ]; then
  docker compose -f compose.yml -f compose.public.yml up -d --build --remove-orphans
elif [ "$dev" = true ]; then
  # Create .env files required by compose.dev.yml volume mounts if they don't exist.
  # Docker creates empty directories in their place if the host files are missing,
  # which causes the services to fail to start.
  touch -a app/.env accounting/.env notifications-ts/.env auth/.env social/.env
  docker compose -f compose.yml -f compose.dev.yml up -d --build --remove-orphans
else
  docker compose up -d --build --remove-orphans
fi

# cleanup old images and volumes
if [ "$noprune" = false ]; then
  docker system prune -f
fi

echo "Waiting for the services to start..."
sleep 10

fi

# Migrate service databases
if [ "$demo" = true  ]; then
  docker compose exec auth pnpm prisma migrate reset --force
  docker compose exec social pnpm prisma migrate deploy
  docker compose exec accounting pnpm prisma migrate reset --force
  docker compose exec notifications-ts pnpm prisma migrate reset --force
  sleep 2
else
  docker compose exec auth pnpm prisma migrate deploy
  docker compose exec social pnpm prisma migrate deploy
  docker compose exec accounting pnpm prisma migrate deploy
  docker compose exec notifications-ts pnpm prisma migrate deploy
  sleep 2
fi

# Bootstrap the configured superadmin in Auth and Social.
./shared/cli/komunitin admin bootstrap
