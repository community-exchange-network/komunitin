# parse args
# Function to display usage
usage() {
    echo "Usage: $0 [--up] [--ices] [--demo] [--dev] [--public]"
    exit
}

# Parse arguments
ices=false
demo=false
public=false
up=false
dev=false

while [[ "$1" != "" ]]; do
    case "$1" in
        --up)
            up=true
            ;;
        --ices)
            ices=true
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
  docker compose -f compose.yml -f compose.public.yml up -d --build
elif [ "$dev" = true ]; then
  docker compose -f compose.yml -f compose.dev.yml up -d --build
else
  docker compose up -d --build
fi

echo "Waiting for the services to start..."
sleep 10

fi

if [ "$demo" = true  ]; then
  # Install Accounting service
  docker compose exec accounting pnpm prisma migrate reset --force
  sleep 2
fi

# Install IntegralCES

if [ "$ices" = true ]; then
  export BASE_URL=$ICES_URL
  ices_args=()
  [ "$dev" = true ] && ices_args+=("--dev")
  [ "$demo" = true ] && ices_args+=("--demo")
  . ../ices/install.sh "${ices_args[@]}"

  docker compose exec integralces drush vset ces_komunitin_app_url $KOMUNITIN_APP_URL
  docker compose exec integralces drush vset ces_komunitin_accounting_url $KOMUNITIN_ACCOUNTING_URL
  docker compose exec integralces drush vset ces_komunitin_accounting_url_internal http://accounting:2025
  docker compose exec integralces drush vset ces_komunitin_notifications_url_internal http://notifications:2028
fi

# Migrate ICES demo data to the accounting service

if [ "$demo" = true ]; then

# Migrate NET1
docker compose exec integralces drush scr sites/all/modules/ices/ces_develop/drush_set_exchange_data.php --code=NET1 --registration_offers=1 --registration_wants=0
./accounting/cli/migrate.sh "admin" "$ICES_ADMIN_PASSWORD" "NET1"
docker compose exec integralces drush scr sites/all/modules/ices/ces_develop/drush_set_exchange_data.php --code=NET1 --registration_offers=1 --registration_wants=0 --komunitin_accounting=1 --komunitin_redirect=1 --komunitin_allow_anonymous_member_list=1

# Migrate NET2
docker compose exec integralces drush scr sites/all/modules/ices/ces_develop/drush_set_exchange_data.php --code=NET2 --registration_offers=0 --registration_wants=0
./accounting/cli/migrate.sh "admin" "$ICES_ADMIN_PASSWORD" "NET2"
docker compose exec integralces drush scr sites/all/modules/ices/ces_develop/drush_set_exchange_data.php --code=NET2 --registration_offers=0 --registration_wants=0 --komunitin_accounting=1 --komunitin_redirect=1 --komunitin_allow_anonymous_member_list=1

# Configure mutual trust between NET1 and NET2
./accounting/cli/trust.sh "riemann@komunitin.org" "komunitin" "NET1" "NET2" 100
./accounting/cli/trust.sh "fermat@komunitin.org" "komunitin" "NET2" "NET1" 1000

  if [ "$dev" = true ]; then
    # Create Credit commons node
    ./accounting/cli/create_credit_commons_node.sh "riemann@komunitin.org" "komunitin" "NET1" "http://cc"
    ./accounting/cli/create_credit_commons_node.sh "fermat@komunitin.org" "komunitin" "NET2" "http://cc"

    # Start the database on the CC server
    docker compose exec cc service mariadb start
  fi

fi
