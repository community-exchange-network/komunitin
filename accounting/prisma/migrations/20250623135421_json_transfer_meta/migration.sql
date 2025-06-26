-- This migration changes the "meta" column in the "Transfer" table from TEXT to JSONB.
-- It initializes the new JSONB column with a default object containing a "description" field.

ALTER TABLE "Transfer"
ALTER COLUMN "meta" TYPE JSONB
USING jsonb_build_object('description', "meta"::text);
