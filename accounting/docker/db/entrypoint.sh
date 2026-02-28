#!/bin/bash
set -e

ARGS=("$@")

# Check if WALG_ENABLE is set to true
if [ "$WALG_ENABLE" = "true" ]; then
  echo "WAL-G is enabled. Configuring PostgreSQL and cron for WAL archiving."

  # Make cron log file accessible to the postgres user
  touch /var/log/wal-g.log
  chown postgres:postgres /var/log/wal-g.log

  # Write WAL-G environment variables to a file so they can be loaded by cron jobs
  cat <<EOF > /usr/local/bin/wal-g.env
  WALG_COMPRESSION_METHOD=${WALG_COMPRESSION_METHOD}
  WALG_S3_PREFIX=${WALG_S3_PREFIX}
  AWS_ACCESS_KEY_ID=${AWS_ACCESS_KEY_ID}
  AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY}
  AWS_ENDPOINT=${AWS_ENDPOINT}
  AWS_REGION=${AWS_REGION}
  AWS_S3_FORCE_PATH_STYLE=${AWS_S3_FORCE_PATH_STYLE}
EOF

  # Start cron in background
  cron

  # Tail cron log in background so it gets sent to Docker logs
  tail -F /var/log/wal-g.log &

else
    echo "WAL-G is disabled (WALG_ENABLE is not 'true'). Disabling archive_mode."
    ARGS+=("-c" "archive_mode=off" "-c" "archive_command=/bin/true")
fi

# Execute the original postgres entrypoint with all passed arguments
exec docker-entrypoint.sh "${ARGS[@]}"
