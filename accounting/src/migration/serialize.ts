import TsJapi from "ts-japi"
import { projection } from "../server/serialize"
import { ApiMigration, MigrationData } from "./migration"

const { Serializer } = TsJapi

export const MigrationSerializer = new Serializer<ApiMigration>("migrations", {
  version: null,
  projection: projection<ApiMigration>(
    ["code", "name", "kind", "status", "created", "updated", "data"]
  ),
})
