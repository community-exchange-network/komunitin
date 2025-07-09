#!/bin/bash
set -e

# Make cron log file accessible to the postgres user
touch /var/log/wal-g.log
chown postgres:postgres /var/log/wal-g.log

# Write WAL-G environment variables to a file so they can be loaded by cron jobs
cat <<EOF > /usr/local/bin/wal-g.env
WALG_COMPRESSION_METHOD=${WALG_COMPRESSION_METHOD}
WALG_GS_PREFIX=${WALG_GS_PREFIX}
GOOGLE_APPLICATION_CREDENTIALS=${GOOGLE_APPLICATION_CREDENTIALS}
EOF

# Start cron in background
cron

# Tail cron log in background so it gets sent to Docker logs
tail -F /var/log/wal-g.log &

# Execute the original postgres entrypoint with all passed arguments
exec docker-entrypoint.sh "$@"
