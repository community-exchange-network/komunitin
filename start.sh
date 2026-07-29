#!/usr/bin/env bash

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Migrate the databases and provision the configured superadmin. Use --up to
build and start the services first.

Options:
  --up          Build and start the services
  --reset       Reset the service databases before applying migrations
  --demo        Deprecated alias for --reset
  --dev         Start with development config (requires --up)
  --public      Start with production config (requires --up)
  --prune       Remove unused Docker resources after startup
  -h, --help    Show this help message
EOF
}

reset=false
public=false
up=false
prune=false
dev=false

while (( $# > 0 )); do
  case "$1" in
    --up)
      up=true
      ;;
    --reset)
      reset=true
      ;;
    --demo)
      echo "Warning: --demo is deprecated; use --reset." >&2
      reset=true
      ;;
    --public)
      public=true
      ;;
    --dev)
      dev=true
      ;;
    --prune)
      prune=true
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

if [ "$up" = false ] && { [ "$reset" = true ] || [ "$dev" = true ] || [ "$public" = true ] || [ "$prune" = true ]; }; then
  echo "Options --reset, --dev, --public and --prune require --up." >&2
  exit 1
fi

# Load .env file.
set -a
. .env
set +a

# for social db, prisma reset does not work well so we remove the volume and let docker 
# compose recreate it.
if [ "$reset" = true  ]; then
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
  mkdir -p notifications-ts/tmp
  docker compose -f compose.yml -f compose.dev.yml up -d --build --remove-orphans
  docker compose exec auth pnpm prisma generate
  docker compose exec social pnpm prisma generate
  docker compose exec accounting pnpm prisma generate
else
  docker compose up -d --build --remove-orphans
fi

# cleanup old images and volumes
if [ "$prune" = true ]; then
  docker system prune -f
fi

echo "Waiting for the services to start..."
sleep 10

fi

# Migrate service databases
if [ "$reset" = true  ]; then
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
