#!/bin/bash

set -e

# Load WAL-G environment variables
set -a
source /usr/local/bin/wal-g.env
set +a

# Clean up old backups using WAL-G
/usr/local/bin/wal-g delete --confirm retain 7

# Check if the cleanup command was successful
if [ $? -ne 0 ]; then
    echo "Backup cleanup failed. Check /var/log/wal-g.log for details."
    exit 1
else
    echo "Backup cleanup completed successfully."
fi
