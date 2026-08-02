# Build image
FROM node:22 AS komunitin-accounting

WORKDIR /app

# Install pnpm
RUN corepack enable && corepack prepare pnpm@10.26.1 --activate
# Copy just package.json (and pnpm-lock.yaml) so when there's no package changes we don't
# need to redo the install step.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Install dependencies.
RUN pnpm install --frozen-lockfile

# Copy sources
COPY . .

# Build prisma sources
RUN pnpm prisma generate

# Build App
RUN pnpm run build

HEALTHCHECK CMD node -e "fetch('http://127.0.0.1:2025/health').then(response => process.exit(response.ok ? 0 : 1), () => process.exit(1))"

# Run accounting service
CMD ["node", "dist/index.mjs"]
