FROM node:24 AS komunitin-social

WORKDIR /app

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

RUN pnpm install

COPY . .

ENV DATABASE_URL="postgresql://social:social@localhost:5434/social?schema=public"
RUN pnpm prisma generate

RUN pnpm run build

CMD ["node", "dist/index.mjs"]
