FROM node:24

RUN corepack enable && corepack prepare pnpm@10.26.1 --activate

WORKDIR /app
COPY . .
RUN pnpm --dir social install --prod --frozen-lockfile --ignore-scripts \
  && pnpm --dir shared/cli install --frozen-lockfile

ENV KOMUNITIN_CLI_DOCKER=true
ENTRYPOINT ["node", "--env-file=/app/.env", "/app/shared/cli/index.ts"]
