#!/bin/bash

# This script is supposed to be run from "docker run" command or similar.

set -e

# help
if [ "$1" == "--help" ] || [ "$1" == "-h" ]; then
    echo "Usage: restore_backup.sh [backup_name|timestamp]"
    echo "Restores a PostgreSQL database from a WAL-G backup."
    echo "If no argument is provided, restores the latest backup."
    echo "If a timestamp is provided, performs point-in-time recovery to that timestamp."
    echo "If a backup name is provided, restores that specific backup."
    echo "Example: restore_backup.sh \"2025-07-09 10:25:00\""
    echo "This script must be run as the postgres user and with the WAL-G environment variables set."
    echo "When running from docker compose:"
    echo "  docker compose run --user postgres --entrypoint /bin/bash <db-service> /usr/local/bin/restore_backup.sh [backup_name|timestamp]"
    exit 0
fi

# Ensure we are running as the postgres user
if [ "$(whoami)" != "postgres" ]; then
    echo "restore_backup.sh must be run as the postgres user."
    exit 1
fi

# Check if WAL-G environment variables are set
if [ -z "$WALG_S3_PREFIX" ]; then
    echo "ERROR: WALG_S3_PREFIX environment variable is not set."
    exit 1
fi

backup_name=${1:-LATEST}
postgres_args=(-c config_file=/etc/postgresql/recovery.conf)
# A timestamp requests point-in-time recovery from the latest base backup.
if [[ "$1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]][0-9]{2}:[0-9]{2}:[0-9]{2} ]]; then
  echo "Point-in-time recovery to: $1"
  backup_name=LATEST
  postgres_args+=(-c "recovery_target_time=$1" -c recovery_target_action=promote)
fi

# Clean up the data directory before restoring
if [ -d /var/lib/postgresql/data ]; then
    echo "Cleaning up existing data directory..."
    rm -rf /var/lib/postgresql/data/*
fi

# Restore the base backup using WAL-G
echo "Fetching base backup: $backup_name"
/usr/local/bin/wal-g backup-fetch /var/lib/postgresql/data "$backup_name"
echo "Base backup restore completed successfully."

# Create the recovery.signal file
touch /var/lib/postgresql/data/recovery.signal

# Start PostgreSQL process
echo "Starting PostgreSQL..."
exec docker-entrypoint.sh postgres "${postgres_args[@]}"

