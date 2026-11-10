#!/usr/bin/env bash

set -e

usage() {
  cat <<EOF
Usage: $0 [OPTIONS]

Migrate the databases and provision the configured superadmin. Use --up to
build the images and start the services.

Options:
  --up          Build and start the services
  --reset       Reset the service databases before applying migrations
  --demo        Reset service databases and import the Bramblewick CSV demo bundle
  --dev         Set up local HTTPS and start with development config (requires --up)
  --public      Start with production config (requires --up)
  --prune       Remove unused Docker resources after startup
  -h, --help    Show this help message
EOF
}

reset=false
demo=false
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
      demo=true
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
  echo "Options --reset, --demo, --dev, --public and --prune require --up." >&2
  exit 1
fi

# Load .env file.
set -a
. .env
set +a

up_args=()
# Prepare trusted HTTPS when mkcert is available; containers provide the fallback.
if [ "$dev" = true ]; then
  export COMPOSE_FILE=compose.yml:compose.dev.yml
  up_args+=(--renew-anon-volumes)
  mkdir -p notifications-ts/tmp
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
elif [ "$public" = true ]; then
  export COMPOSE_FILE=compose.yml:compose.public.yml
fi

services=(auth social accounting notifications-ts)
migrate=(exec)
if [ "$up" = true ]; then
  docker compose build
  if [ "$reset" = true ]; then
    docker compose stop "${services[@]}"
    # Social needs a fresh volume to reinstall its PostgreSQL extensions.
    docker compose down -v db-social
  fi
  # Compose waits for each service's database before running Prisma.
  migrate=(run --rm)
fi

for service in "${services[@]}"; do
  action=(deploy)
  if [ "$reset" = true ] && [ "$service" != social ]; then
    action=(reset --force)
  fi
  docker compose "${migrate[@]}" "$service" pnpm prisma migrate "${action[@]}"
done

# Auth and Accounting need the migrated schema before they can serve requests.
if [ "$up" = true ]; then
  docker compose up --wait --wait-timeout 300 --remove-orphans "${up_args[@]}"
else
  docker compose start --wait --wait-timeout 300 "${services[@]}"
fi

if [ "$prune" = true ]; then
  docker system prune -f
fi

# Bootstrap the configured superadmin in Auth and Social.
./shared/cli/komunitin admin bootstrap
if [ "$demo" = true ]; then
  # Package and import the checked-in demo content.
  mkdir -p shared/demo/tmp
  ./shared/cli/komunitin admin bundle demo shared/demo/tmp/bramblewick.zip
  ./shared/cli/komunitin admin migrate shared/demo/tmp/bramblewick.zip
fi
