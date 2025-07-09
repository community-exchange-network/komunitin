FROM debian:bookworm-slim AS wal-g

WORKDIR /app

ARG UBUNTU_VERSION=22.04 \
    WALG_VERSION=3.0.7

ENV WALG_EXE=wal-g-pg-ubuntu-$UBUNTU_VERSION-amd64

RUN set -ex && \
    apt update -q && \
    apt install -yq --no-install-recommends ca-certificates curl && \
    curl -fLs "https://github.com/wal-g/wal-g/releases/download/v$WALG_VERSION/$WALG_EXE.tar.gz" -o wal-g.tar.gz && \
    tar -xzf wal-g.tar.gz && \
    mv $WALG_EXE wal-g && \
    ./wal-g --version

FROM postgres:16 AS komunitin-db-accounting

# Install cron
RUN set -ex && \
    apt update -q && \
    apt install -yq --no-install-recommends ca-certificates cron && \
    rm -rf /var/lib/apt/lists/*

# Copy the wal-g binary from the builder stage
COPY --from=wal-g /app/wal-g /usr/local/bin/wal-g

# Copy the initialization script
COPY init-app-db.sh /docker-entrypoint-initdb.d/
RUN chmod +x /docker-entrypoint-initdb.d/*.sh

# Copy the cron job file
COPY cron-wal-g /etc/cron.d/wal-g
RUN chmod 0644 /etc/cron.d/wal-g

# Copy the postgres.conf file
COPY postgres.conf /etc/postgresql/postgresql.conf
RUN chmod 0644 /etc/postgresql/postgresql.conf

# Copy the recovery.conf file
COPY recovery.conf /etc/postgresql/recovery.conf
RUN chmod 0644 /etc/postgresql/recovery.conf

# Copy all scripts
COPY *.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/*.sh

# Set the entrypoint to the custom script
ENTRYPOINT ["/usr/local/bin/entrypoint.sh"]
CMD ["postgres", "-c", "config_file=/etc/postgresql/postgresql.conf"]
