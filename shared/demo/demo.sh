#!/usr/bin/env bash
set -e

# start.sh loads .env and passes whether development services are enabled.
project_dir=$(cd "$(dirname "$0")/../.." && pwd)
main_project="${COMPOSE_PROJECT_NAME:-$(basename "$project_dir")}"
: "${ADMIN_PASSWORD:?Set ADMIN_PASSWORD in .env for --demo}"
ICES_PATH=$(cd "${ICES_PATH:-$project_dir/../ices}" && pwd)
export ICES_PATH
export COMPOSE_FILE="$project_dir/shared/demo/compose.demo.yml"
export COMPOSE_PROJECT_NAME="$main_project-demo"
export PATH="$project_dir/shared/cli:$PATH"
# Accounting and Social fetch records and images through the published HTTP port.
export BASE_URL="http://host.docker.internal:${ICES_PORT:-2029}"

bundle_dir=$(mktemp -d)
trap 'cd "$project_dir"; rm -rf "$bundle_dir"; docker compose down -v' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
cd "$bundle_dir"

drush() {
  docker compose exec -T integralces drush "$@"
}

docker compose up -d --build --wait
# The legacy installer tolerates non-fatal Drush language-module errors.
bash "$ICES_PATH/install.sh" --demo
drush vset ces_komunitin_app_url "$KOMUNITIN_APP_URL"
drush vset ces_komunitin_accounting_url "$KOMUNITIN_ACCOUNTING_URL"
drush vset ces_komunitin_accounting_url_internal "${KOMUNITIN_ACCOUNTING_URL/localhost/host.docker.internal}"

for code in NET1 NET2; do
  registration_offers=0
  if [ "$code" = NET1 ]; then
    registration_offers=1
  fi
  komunitin accounting migrate-ices "$code" "$BASE_URL"
  drush scr sites/all/modules/ices/ces_develop/drush_set_exchange_data.php \
    --code="$code" --registration_offers="$registration_offers" --registration_wants=0 \
    --komunitin_accounting=1 --komunitin_allow_anonymous_member_list=1
done

for code in NET1 NET2; do
  komunitin admin bundle ices --url "$BASE_URL" --code "$code" --output "$code.zip"
  komunitin admin migrate "$code.zip"
done

komunitin accounting trust NET1 NET2 100 --email riemann@komunitin.org --password komunitin
komunitin accounting trust NET2 NET1 1000 --email fermat@komunitin.org --password komunitin

if [ "${1:-false}" = true ]; then
  komunitin accounting create-credit-commons-node NET1 http://cc --email riemann@komunitin.org --password komunitin
  komunitin accounting create-credit-commons-node NET2 http://cc --email fermat@komunitin.org --password komunitin
  docker compose -p "$main_project" -f "$project_dir/compose.yml" -f "$project_dir/compose.dev.yml" exec -T cc service mariadb start
fi
