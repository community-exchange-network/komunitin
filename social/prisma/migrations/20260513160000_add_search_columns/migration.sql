CREATE FUNCTION jsonb_scalar_values_text(data jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT string_agg(value #>> '{}', ' ')
  FROM jsonb_path_query(data, '$.** ? (@.type() != "object" && @.type() != "array")') AS value
$$;

CREATE FUNCTION immutable_unaccent(data text)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT unaccent(data)
$$;

CREATE FUNCTION normalize_search_text(data text)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT btrim(
    regexp_replace(
      immutable_unaccent(lower(data)),
      '[[:space:][:punct:]]+',
      ' ',
      'g'
    )
  )
$$;

ALTER TABLE "Group"
  ADD COLUMN "search" text
  GENERATED ALWAYS AS (
    left(
      normalize_search_text(
        coalesce("tenantId", '') || ' ' ||
        coalesce("name", '') || ' ' ||
        coalesce(jsonb_scalar_values_text("address"), '') || ' ' ||
        coalesce(jsonb_scalar_values_text("contacts"), '') || ' ' ||
        coalesce("description", '')
      ),
      512
    )
  ) STORED;

CREATE INDEX "Group_tenantId_search_gin_idx"
  ON "Group" USING GIN ("tenantId", "search" gin_trgm_ops);

ALTER TABLE "Member"
  ADD COLUMN "search" text
  GENERATED ALWAYS AS (
    left(
      normalize_search_text(
        coalesce("code", '') || ' ' ||
        coalesce("name", '') || ' ' ||
        coalesce(jsonb_scalar_values_text("address"), '') || ' ' ||
        coalesce(jsonb_scalar_values_text("contacts"), '') || ' ' ||
        coalesce("description", '')
      ),
      255
    )
  ) STORED;

CREATE INDEX "Member_tenantId_search_gin_idx"
  ON "Member" USING GIN ("tenantId", "search" gin_trgm_ops);

ALTER TABLE "Category"
  ADD COLUMN "search" text
  GENERATED ALWAYS AS (
    left(
      normalize_search_text(
        coalesce("code", '') || ' ' ||
        coalesce("name", '') || ' ' ||
        coalesce("meta"->>'description', '')
      ),
      255
    )
  ) STORED;

CREATE INDEX "Category_tenantId_search_gin_idx"
  ON "Category" USING GIN ("tenantId", "search" gin_trgm_ops);

ALTER TABLE "Post"
  ADD COLUMN "search" text
  GENERATED ALWAYS AS (
    left(
      normalize_search_text(
        coalesce("type", '') || ' ' ||
        coalesce("code", '') || ' ' ||
        coalesce("title", '') || ' ' ||
        coalesce("description", '') || ' ' ||
        coalesce(jsonb_scalar_values_text("data"), '')
      ),
      1024
    )
  ) STORED;

CREATE INDEX "Post_tenantId_search_gin_idx"
  ON "Post" USING GIN ("tenantId", "search" gin_trgm_ops);