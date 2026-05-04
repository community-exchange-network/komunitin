-- Resolve PostGIS symbols from either extensions schema or public schema.
SET search_path = extensions, public, pg_catalog;

-- Group.location computed from longitude/latitude.
ALTER TABLE "Group"
  ADD COLUMN "location" geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN "latitude" IS NULL OR "longitude" IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
    END
  ) STORED;

CREATE INDEX "Group_location_gix"
  ON "Group" USING GIST ("location");

-- Member.location computed from longitude/latitude.
ALTER TABLE "Member"
  ADD COLUMN "location" geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN "latitude" IS NULL OR "longitude" IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
    END
  ) STORED;

CREATE INDEX "Member_location_gix"
  ON "Member" USING GIST ("location");

-- Post.location computed from longitude/latitude.
ALTER TABLE "Post"
  ADD COLUMN "location" geography(Point, 4326)
  GENERATED ALWAYS AS (
    CASE
      WHEN "latitude" IS NULL OR "longitude" IS NULL THEN NULL
      ELSE ST_SetSRID(ST_MakePoint("longitude", "latitude"), 4326)::geography
    END
  ) STORED;

CREATE INDEX "Post_location_gix"
  ON "Post" USING GIST ("location");
