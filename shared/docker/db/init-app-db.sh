#!/bin/bash

# This line just tells the shell to stop if any error.
set -e

# Create a new user that will not have the role to bypass row level security.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<-EOSQL
	CREATE USER $POSTGRES_APP_USER WITH PASSWORD '$POSTGRES_APP_PASSWORD';
	ALTER USER $POSTGRES_APP_USER CREATEDB;
EOSQL

# Optional: create the final app database up front.
if [ -n "$POSTGRES_APP_DB" ]; then
	createdb --username "$POSTGRES_USER" --owner "$POSTGRES_APP_USER" "$POSTGRES_APP_DB"
fi

# Optional: enable requested extensions in the final app database.
if [ -n "$POSTGRES_APP_DB" ] && [ -n "$POSTGRES_APP_EXTENSIONS" ]; then
	IFS=',' read -r -a extensions <<< "$POSTGRES_APP_EXTENSIONS"

	for ext in "${extensions[@]}"; do
		psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_APP_DB" -c "CREATE EXTENSION IF NOT EXISTS \"$ext\";"
	done
fi
