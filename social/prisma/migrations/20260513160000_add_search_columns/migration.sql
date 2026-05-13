CREATE FUNCTION jsonb_scalar_values_text(data jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT string_agg(value #>> '{}', ' ')
  FROM jsonb_path_query(data, '$.** ? (@.type() != "object" && @.type() != "array")') AS value
$$;

ALTER TABLE "Group"
  ADD COLUMN "search" text
  GENERATED ALWAYS AS (
    left(
      btrim(
        regexp_replace(
          lower(
            coalesce("tenantId", '') || ' ' ||
            coalesce("name", '') || ' ' ||
            coalesce("description", '') || ' ' ||
            coalesce(jsonb_scalar_values_text("address"), '') || ' ' ||
            coalesce(jsonb_scalar_values_text("contacts"), '')
          ),
          '[[:space:][:punct:]]+',
          ' ',
          'g'
        )
      ),
      1024
    )
  ) STORED;

CREATE INDEX "Group_tenantId_search_gin_idx"
  ON "Group" USING GIN ("tenantId", "search" gin_trgm_ops);