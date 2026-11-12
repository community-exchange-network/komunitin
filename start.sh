#!/usr/bin/env bash

set -e

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Build the images, migrate the databases, start the services and provision the
configured superadmin.

Options:
  --reset       Recreate the stack with empty Docker volumes
  --demo        Reset the stack and import the Bramblewick CSV demo bundle
  --dev         Set up local HTTPS and start with development config
  --public      Start with production config
  --prune       Remove unused Docker resources after startup
  -h, --help    Show this help message
EOF
}

reset=false
demo=false
public=false
prune=false
dev=false

while (( $# > 0 )); do
  case "$1" in
    --up) ;;
    --reset) reset=true ;;
    --demo) demo=true; reset=true ;;
    --public) public=true ;;
    --dev) dev=true ;;
    --prune) prune=true ;;
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

# Load .env file.
set -a
. .env
set +a

# Select Compose files and startup options.
up_args=()
if [ "$dev" = true ]; then
  export COMPOSE_FILE=compose.yml:compose.dev.yml
  up_args+=(--renew-anon-volumes)
elif [ "$public" = true ]; then
  export COMPOSE_FILE=compose.yml:compose.public.yml
fi

# Prepare trusted HTTPS when mkcert is available; containers provide the fallback.
if [ "$dev" = true ]; then
  cert_dir="$PWD/app/tmp/certs"
  mkdir -p "$cert_dir"
  if { [ ! -f "$cert_dir/localhost.pem" ] || [ ! -f "$cert_dir/localhost-key.pem" ]; } && command -v mkcert >/dev/null; then
    (cd "$cert_dir" && mkcert localhost)
  fi
  if [ -f "$cert_dir/localhost.pem" ] && [ -f "$cert_dir/localhost-key.pem" ]; then
    # Let S3Mock read the PEM files directly instead of its default keystore.
    cat > "$cert_dir/s3mock.properties" <<'EOF'
server.ssl.key-store=
server.ssl.key-password=
server.ssl.certificate=file:/certs/localhost.pem
server.ssl.certificate-private-key=file:/certs/localhost-key.pem
EOF
  else
    rm -f "$cert_dir/s3mock.properties"
    echo "Warning: using untrusted self-signed HTTPS certificates. Install mkcert for trusted HTTPS and PWA features." >&2
  fi
fi

# Build before changing the running stack.
docker compose build

# Recreate all services and their volumes when explicitly requested.
if [ "$reset" = true ]; then
  docker compose down -v
fi

# Start database containers.
docker compose up --wait --wait-timeout 300 \
  db-auth db-accounting db-notifications-ts db-social db-notifications

# Apply migrations while old applications are still running.
docker compose run --rm -T auth pnpm prisma migrate deploy
docker compose run --rm -T accounting pnpm prisma migrate deploy
docker compose run --rm -T notifications-ts pnpm prisma migrate deploy
docker compose run --rm -T social pnpm prisma migrate deploy

# Update applications.
docker compose up --wait --wait-timeout 300 --remove-orphans "${up_args[@]}"

# Bootstrap the configured superadmin in Auth and Social.
./shared/cli/komunitin admin bootstrap
if [ "$demo" = true ]; then
  # Package and import the checked-in demo content.
  mkdir -p shared/demo/tmp
  ./shared/cli/komunitin admin bundle demo shared/demo/tmp/bramblewick.zip
  ./shared/cli/komunitin admin migrate shared/demo/tmp/bramblewick.zip
fi

if [ "$prune" = true ]; then
  docker system prune -f
fi
