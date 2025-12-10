-- Rename Enum
ALTER TYPE "public"."AccountType" RENAME TO "AccountKind";

-- Rename Column
ALTER TABLE "public"."Account" RENAME COLUMN "type" TO "kind";
