FROM node:24 AS komunitin-auth

WORKDIR /app

ENV CI=true

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install --frozen-lockfile

COPY . .

ENV DATABASE_URL=postgresql://auth:auth@localhost:5435/auth?schema=public

RUN pnpm prisma generate
RUN pnpm run build

HEALTHCHECK --start-period=60s --timeout=5s CMD curl -fsS -o /dev/null "http://127.0.0.1:${PORT:-2026}/health"

CMD ["node", "dist/index.mjs"]
