FROM node:24 AS komunitin-notifications-ts

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install

COPY . .

ENV DATABASE_URL="postgresql://notifications:notifications@localhost:5433/notifications"
RUN pnpm prisma generate

RUN pnpm run build

CMD ["pnpm", "start"]
