#!/bin/bash

set -e

# Ensure we are running as the postgres user
if [ "$(whoami)" != "postgres" ]; then
    echo "create_backup.sh must be run as the postgres user."
    exit 1
fi

# Load WAL-G environment variables
set -a 
source /usr/local/bin/wal-g.env
set +a 

# Create a backup using WAL-G
/usr/local/bin/wal-g backup-push /var/lib/postgresql/data

# Check if the backup command was successful
if [ $? -ne 0 ]; then
    echo "Backup failed."
    exit 1
else
    echo "Backup completed successfully."
fi
