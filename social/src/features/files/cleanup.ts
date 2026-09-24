import { Prisma, type File as DbFile } from '../../generated/prisma/client'
import { privilegedDb } from '../../server/multitenant'
import logger from '../../utils/logger'
import prisma from '../../utils/prisma'
import { config } from '../../config'
import { deleteFromS3 } from './service'

const MS_PER_DAY = 24 * 60 * 60 * 1000

type LiveReference = {
  resourceType: string
  resourceId: string
}

export type FileCleanupStats = {
  candidates: number
  deleted: number
  skippedReferenced: number
  failed: number
}

type CleanupOptions = {
  now?: Date
}

const emptyStats = (): FileCleanupStats => ({
  candidates: 0,
  deleted: 0,
  skippedReferenced: 0,
  failed: 0,
})

const cleanupCutoff = (now: Date): Date => {
  return new Date(now.getTime() - config.UPLOAD_CLEANUP_RETENTION_DAYS * MS_PER_DAY)
}

const findCleanupCandidates = async (cutoff: Date): Promise<DbFile[]> => {
  const db = privilegedDb(prisma)

  return db.file.findMany({
    where: {
      resourceId: null,
      updated: {
        lt: cutoff,
      },
    },
    orderBy: {
      updated: 'asc',
    },
  })
}

const findLiveResourceReference = async (file: DbFile): Promise<LiveReference | null> => {
  const db = privilegedDb(prisma)
  const rows = await db.$queryRaw<LiveReference[]>(Prisma.sql`
    SELECT refs."resourceType", refs."resourceId"
    FROM (
      SELECT 'groups'::text AS "resourceType", g."id"::text AS "resourceId"
      FROM "Group" g
      WHERE g."tenantId" = ${file.tenantId}
        AND g."deleted" IS NULL
        AND jsonb_typeof(g."image") = 'object'
        AND g."image"->>'url' = ${file.url}

      UNION ALL

      SELECT 'members'::text AS "resourceType", m."id"::text AS "resourceId"
      FROM "Member" m
      WHERE m."tenantId" = ${file.tenantId}
        AND m."deleted" IS NULL
        AND jsonb_typeof(m."image") = 'object'
        AND m."image"->>'url' = ${file.url}

      UNION ALL

      SELECT p."type"::text AS "resourceType", p."id"::text AS "resourceId"
      FROM "Post" p
      WHERE p."tenantId" = ${file.tenantId}
        AND p."deleted" IS NULL
        AND EXISTS (
          SELECT 1
          FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(p."images") = 'array' THEN p."images"
              ELSE '[]'::jsonb
            END
          ) AS image
          WHERE image->>'url' = ${file.url}
        )
    ) refs
    LIMIT 1
  `)

  return rows[0] ?? null
}

/**
 * Delete old files that still have database rows but are no longer linked to a resource.
 *
 * This job intentionally does not perform bucket-wide S3 reconciliation. Objects
 * without a corresponding File row are outside the scope of this cleanup.
 */
export const cleanupUnlinkedFiles = async (options: CleanupOptions = {}): Promise<FileCleanupStats> => {
  const stats = emptyStats()
  const cutoff = cleanupCutoff(options.now ?? new Date())
  const db = privilegedDb(prisma)
  const candidates = await findCleanupCandidates(cutoff)
  stats.candidates = candidates.length

  for (const file of candidates) {
    try {
      // A File row with resourceId null should not still be referenced from live
      // resource JSON. If it is, the linking metadata is inconsistent, so keep
      // the object and surface the finding for investigation.
      const liveReference = await findLiveResourceReference(file)
      if (liveReference) {
        stats.skippedReferenced++
        logger.warn({
          fileId: file.id,
          tenantId: file.tenantId,
          url: file.url,
          ...liveReference,
        }, 'Unlinked file is still referenced by a live resource; skipping S3 cleanup')
        continue
      }

      await deleteFromS3(file.key)
      const result = await db.file.deleteMany({
        where: {
          id: file.id,
          tenantId: file.tenantId,
        },
      })
      stats.deleted += result.count
    } catch (err) {
      stats.failed++
      logger.error({ err, fileId: file.id, tenantId: file.tenantId }, 'Failed to clean up unlinked file')
    }
  }

  logger.info({ cutoff, stats }, 'Finished unlinked file cleanup')
  return stats
}
