# parse args
# Function to display usage
usage() {
    echo "Usage: $0 [--up] [--demo] [--dev] [--public]"
    exit
}

# Parse arguments
demo=false
public=false
up=false
dev=false

while [[ "$1" != "" ]]; do
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
        *)
            usage
            ;;
    esac
    shift
done

# Load .env file.
set -a
. .env
set +a

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
docker system prune -f

echo "Waiting for the services to start..."
sleep 10

fi

# Migrate service databases
if [ "$demo" = true  ]; then
  docker compose exec auth pnpm prisma migrate reset --force
  docker compose exec accounting pnpm prisma migrate reset --force
  docker compose exec notifications-ts pnpm prisma migrate reset --force
  # for social db, prisma reset does not work well so we recreate the db container instead.
  docker compose down -v db-social && docker compose up -d db-social
  sleep 2
else
  docker compose exec auth pnpm prisma migrate deploy
  docker compose exec social pnpm prisma migrate deploy
  docker compose exec accounting pnpm prisma migrate deploy
  docker compose exec notifications-ts pnpm prisma migrate deploy
  sleep 2
fi
