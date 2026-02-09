# Dockerfile that builds 2 images:
# komunitin-app-build: image that builds the komunitin app from the source code.
# komunitin-app: lightweight image that runs the komunitin app in a production environment.
#

# Build stage


FROM node:20 AS komunitin-app-build

ARG FLAVOR=komunitin 

WORKDIR /app

# Install mkcert
RUN apt-get update && apt-get -y install libnss3-tools wget \
  && wget -O /usr/local/bin/mkcert https://github.com/FiloSottile/mkcert/releases/download/v1.4.3/mkcert-v1.4.3-linux-amd64 \
  && chmod a+x /usr/local/bin/mkcert \
  && mkcert -install

# Set local CA ROOT env variable (used from quasar.conf.js) 
ENV LOCAL_CA_ROOT=/root/.local/share/mkcert/rootCA.pem

# Create self-signed certificates.
RUN mkdir -p tmp/certs && mkcert -cert-file tmp/certs/localhost.pem -key-file tmp/certs/localhost-key.pem localhost

# Copy just package.json (and pnpm-lock.yaml) so when there's no package changes we don't
# need to redo the install step.
COPY package.json pnpm-lock.yaml ./

# Install pnpm and quasar framework
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN mkdir -p $PNPM_HOME
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
RUN pnpm config set global-bin-dir $PNPM_HOME
RUN pnpm add -g @quasar/cli

# Install dependencies.
RUN pnpm install

# Copy sources 
COPY . .

# Set the FLAVOR build argument
ENV FLAVOR=${FLAVOR}

# Build App using the quasar CLI app.
RUN pnpm run build

# Production image komunitin-app

# Use the latest stable Nginx HTTP server over Alpine Linux.
FROM nginx:stable-alpine AS komunitin-app

# Copy the built application from Build stage to nginx HTML folder.
COPY --from=komunitin-app-build /app/dist/pwa /usr/share/nginx/html

# Configure nginx so that load/refresh works with virtual routes
RUN rm /etc/nginx/conf.d/default.conf
COPY docker/localhost.conf /etc/nginx/conf.d/

# Copy and make executable the pre-start script
COPY docker/replace_env_vars.sh /docker-entrypoint.d/replace_env_vars.sh
RUN chmod +x /docker-entrypoint.d/replace_env_vars.sh

EXPOSE 80
