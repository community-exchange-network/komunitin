CREATE FUNCTION jsonb_scalar_values_text(data jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT string_agg(value #>> '{}', ' ')
  FROM jsonb_path_query(data, '$.** ? (@.type() != "object" && @.type() != "array")') AS value
$$;

CREATE FUNCTION normalize_search_text(data text)
RETURNS text
LANGUAGE sql
IMMUTABLE
RETURNS NULL ON NULL INPUT
AS $$
  SELECT btrim(
    regexp_replace(
      unaccent(lower(data)),
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
        concat_ws(
          ' ',
          "tenantId",
          "name",
          jsonb_scalar_values_text("address"),
          jsonb_scalar_values_text("contacts"),
          "description"
        )
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
        concat_ws(
          ' ',
          "code",
          "name",
          jsonb_scalar_values_text("address"),
          jsonb_scalar_values_text("contacts"),
          "description"
        )
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
        concat_ws(
          ' ',
          "code",
          "name",
          "meta"->>'description'
        )
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
        concat_ws(
          ' ',
          "type",
          "code",
          "title",
          "description",
          jsonb_scalar_values_text("data")
        )
      ),
      1024
    )
  ) STORED;

CREATE INDEX "Post_tenantId_search_gin_idx"
  ON "Post" USING GIN ("tenantId", "search" gin_trgm_ops);