#!/bin/bash

# This line just tells the shell to stop if any error.
set -e

POSTGRES_APP_EXTENSIONS_SCHEMA="${POSTGRES_APP_EXTENSIONS_SCHEMA:-extensions}"

# Create a new user that will not have the role to bypass row level security.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER $POSTGRES_APP_USER WITH PASSWORD '$POSTGRES_APP_PASSWORD';
	ALTER USER $POSTGRES_APP_USER CREATEDB;
EOSQL

# Optional: install requested extensions in template1, so they are available in all 
# new databases by default.
if [ -n "$POSTGRES_APP_EXTENSIONS" ]; then
	IFS=',' read -r -a extensions <<< "$POSTGRES_APP_EXTENSIONS"

	for ext in "${extensions[@]}"; do
		psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname template1 -c "CREATE EXTENSION IF NOT EXISTS \"$ext\";"
	done
fi
