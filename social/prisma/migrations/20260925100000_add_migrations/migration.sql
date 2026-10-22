CREATE TABLE "Migration" (
  "id" UUID NOT NULL,
  "code" VARCHAR(31),
  "status" VARCHAR(31) NOT NULL DEFAULT 'running',
  "requestedBy" UUID NOT NULL,
  "data" JSONB NOT NULL DEFAULT '{}',
  "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated" TIMESTAMP(3) NOT NULL,
  "finished" TIMESTAMP(3),
  CONSTRAINT "Migration_pkey" PRIMARY KEY ("id")
);
CREATE TABLE "MigrationEvent" (
  "id" SERIAL NOT NULL,
  "migrationId" UUID NOT NULL,
  "created" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "level" VARCHAR(31) NOT NULL,
  "step" VARCHAR(31) NOT NULL,
  "message" TEXT NOT NULL,
  "data" JSONB NOT NULL DEFAULT '{}',
  CONSTRAINT "MigrationEvent_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "MigrationEvent_migrationId_fkey" FOREIGN KEY ("migrationId") REFERENCES "Migration"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "Migration_code_status_idx" ON "Migration"("code", "status");
CREATE INDEX "MigrationEvent_migrationId_id_idx" ON "MigrationEvent"("migrationId", "id");
