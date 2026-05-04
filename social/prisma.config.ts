import 'dotenv/config';
import { defineConfig } from 'prisma/config';

const defaultDatabaseUrl = 'postgresql://social:social@db-social:5432/social?schema=public';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env.DATABASE_URL ?? defaultDatabaseUrl,
  },
});