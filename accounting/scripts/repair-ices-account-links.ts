import "dotenv/config"
import { parseArgs } from "node:util"
import { PrismaClient } from "@prisma/client"
import { privilegedDb, tenantDb } from "../src/controller/multitenant"

const usage = `Usage: pnpm exec tsx scripts/repair-ices-account-links.ts --source <legacy accounting base URL> [--apply]

Rewrites ICES account links to API_BASE_URL. Defaults to a dry run.
Example source: https://ices.example.org/ces/api/accounting`

const baseUrl = (value: string) => {
  const url = new URL(value)
  if (!["http:", "https:"].includes(url.protocol) || url.search || url.hash || url.username || url.password) {
    throw new Error("Base URLs must be HTTP(S) URLs without credentials, query strings or fragments")
  }
  return url.href.replace(/\/+$/, "")
}

async function main() {
  const { values } = parseArgs({ options: {
    source: { type: "string" },
    apply: { type: "boolean", default: false },
    help: { type: "boolean", default: false }
  } })
  if (values.help) {
    console.log(usage)
  } else {
    if (!values.source || !process.env.API_BASE_URL) {
      throw new Error(`${usage}\nRequires DATABASE_URL and API_BASE_URL in the environment.`)
    }
    const source = baseUrl(values.source)
    const destination = baseUrl(process.env.API_BASE_URL)
    if (source === destination) throw new Error("Source and destination must differ")

    const prisma = new PrismaClient()
    try {
      const where = { type: "accounts", href: { startsWith: `${source}/` } }
      // Discover affected tenants through the existing administrative RLS helper.
      const tenants = await privilegedDb(prisma).externalResource.findMany({
        where, distinct: ["tenantId"], select: { tenantId: true }, orderBy: { tenantId: "asc" }
      })
      console.log(`${values.apply ? "APPLY" : "DRY RUN"}: ${source} -> ${destination}`)
      let matched = 0
      let updated = 0
      let skipped = 0
      for (const { tenantId } of tenants) {
        const db = tenantDb(prisma, tenantId)
        const resources = await db.externalResource.findMany({
          where, select: { id: true, href: true }, orderBy: { id: "asc" }
        })
        const changes = resources.flatMap(({ id, href }) => {
          const path = href.slice(source.length + 1)
          const match = /^([a-z0-9]{4})\/accounts\/([^/?#]+)$/i.exec(path)
          return href.startsWith(`${source}/`) && match && match[2] === id ? [{ id, href, nextHref: `${destination}/${path}` }] : []
        })
        const ignored = resources.length - changes.length
        matched += changes.length
        skipped += ignored
        console.log(`${tenantId}: ${changes.length} matching, ${ignored} skipped (unexpected account path or ID)`)
        for (const change of changes.slice(0, 3)) {
          console.log(`  ${change.href} -> ${change.nextHref}`)
        }
        if (values.apply && changes.length) {
          // Commit each tenant atomically; do not overwrite links changed since discovery.
          const count = await db.transaction(async (tx) => {
            let count = 0
            for (const { id, href, nextHref } of changes) {
              const result = await tx.externalResource.updateMany({
                where: { tenantId, id, type: "accounts", href },
                data: { href: nextHref }
              })
              count += result.count
            }
            return count
          }, { timeout: 60_000 })
          updated += count
          console.log(`${tenantId}: ${count} updated, ${changes.length - count} changed concurrently`)
        }
      }
      console.log(`Total: ${matched} matching, ${updated} updated, ${skipped} skipped`)
      if (!values.apply) console.log("Dry run only. Re-run with --apply to update links.")
    } finally {
      await prisma.$disconnect()
    }
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
