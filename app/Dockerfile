# Dockerfile that builds 2 images:
# komunitin-app-build: image that builds the komunitin app from the source code.
# komunitin-app: lightweight image that runs the komunitin app in a production environment.
#

# Build stage


FROM node:24 AS komunitin-app-build

ARG FLAVOR=komunitin 

WORKDIR /app

# Keep fallback self-signed certificate outside the development source mount.
RUN mkdir -p /certs && openssl req -x509 -newkey rsa:2048 -noenc -days 365 \
  -keyout /certs/localhost-key.pem -out /certs/localhost.pem -subj "/CN=localhost" \
  -addext "subjectAltName=DNS:localhost"

# Enable pnpm via corepack
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

# Copy just package.json (and pnpm-lock.yaml) so when there's no package changes we don't 
# need to redo the install step.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY src-pwa/package.json src-pwa/pnpm-lock.yaml src-pwa/pnpm-workspace.yaml ./src-pwa/
COPY src-ssg/package.json src-ssg/pnpm-lock.yaml src-ssg/pnpm-workspace.yaml ./src-ssg/

# Install dependencies.
RUN pnpm install --frozen-lockfile && pnpm --dir src-pwa install --frozen-lockfile && pnpm --dir src-ssg install --frozen-lockfile

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
COPY --from=komunitin-app-build /app/dist/ssg /usr/share/nginx/html

# Configure nginx so that load/refresh works with virtual routes
RUN rm /etc/nginx/conf.d/default.conf
COPY docker/localhost.conf /etc/nginx/conf.d/

# Copy and make executable the pre-start script
COPY docker/replace_env_vars.sh /docker-entrypoint.d/replace_env_vars.sh
RUN chmod +x /docker-entrypoint.d/replace_env_vars.sh

EXPOSE 80
