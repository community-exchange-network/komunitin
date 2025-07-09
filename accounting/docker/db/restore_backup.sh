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
    echo "  docker-compose run --user postgres --entrypoint /bin/bash accounting-db /usr/local/bin/restore_backup.sh [backup_name|timestamp]"
    exit 0
fi

# Ensure we are running as the postgres user
if [ "$(whoami)" != "postgres" ]; then
    echo "restore_backup.sh must be run as the postgres user."
    exit 1
fi

# Check if WAL-G environment variables are set
if [ -z "$WALG_GS_PREFIX" ] && [ -z "$WALG_S3_PREFIX" ]; then
    echo "ERROR: WAL-G environment variables are not set."
    exit 1
fi

# Get the point in time to restore to from the first argument. 
# If not provided, default to the latest backup.
if [ -z "$1" ]; then
    echo "No point in time specified. Restoring the latest backup."
    BACKUP_NAME="LATEST"
    PITR_TARGET=""
else
    # Check if the argument is a timestamp (YYYY-MM-DD HH:MM:SS format) or backup name
    if [[ "$1" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}[[:space:]][0-9]{2}:[0-9]{2}:[0-9]{2} ]]; then
        echo "Point-in-time recovery to: $1"
        BACKUP_NAME="LATEST"
        PITR_TARGET="$1"
    else
        echo "Restoring specific backup: $1"
        BACKUP_NAME="$1"
        PITR_TARGET=""
    fi
fi

# Clean up the data directory before restoring
if [ -d /var/lib/postgresql/data ]; then
    echo "Cleaning up existing data directory..."
    rm -rf /var/lib/postgresql/data/*
fi

# Restore the base backup using WAL-G
echo "Fetching base backup: $BACKUP_NAME"
/usr/local/bin/wal-g backup-fetch /var/lib/postgresql/data "$BACKUP_NAME" 

# Check if the restore command was successful
if [ $? -ne 0 ]; then
    echo "Base backup restore failed."
    exit 1
else
    echo "Base backup restore completed successfully."
fi

# restore_command is already set in the recovery.conf

if [ -n "$PITR_TARGET" ]; then
    echo "Setting up point-in-time recovery target: $PITR_TARGET"
    # set the recovery_target_timeline postgres conf var
    echo "recovery_target_time = '$PITR_TARGET'" >> /etc/postgresql/recovery.conf
    echo "recovery_target_action = 'promote'" >> /etc/postgresql/recovery.conf
fi

# Create the recovery.signal file
touch /var/lib/postgresql/data/recovery.signal

# Start PostgreSQL process
echo "Starting PostgreSQL..."
exec docker-entrypoint.sh postgres -c config_file=/etc/postgresql/recovery.conf

