import { createHash } from 'node:crypto'
import { fileTypeFromBuffer } from 'file-type'
import { getS3ObjectMetadata, publicUrlBase, uploadToS3 } from '../../clients/s3'
import { config } from '../../config'
import { Prisma } from '../../generated/prisma/client'
import { privilegedDb } from '../../server/multitenant'
import prisma from '../../utils/prisma'
import type { ImageOwner } from './persistence'
import type { MigrationLog } from './types'

const imageKey = (code: string, owner: ImageOwner, source: string) =>
  `${code}/${owner.type}/migration-${owner.id}-${createHash('sha256').update(source).digest('hex')}`

const download = async (url: string) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) })
  if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`)
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of response.body) {
    size += chunk.length
    if (size > config.UPLOAD_MAX_BYTES) throw new Error(`Image exceeds ${config.UPLOAD_MAX_BYTES} bytes`)
    chunks.push(chunk)
  }
  const bytes = Buffer.concat(chunks)
  const detected = await fileTypeFromBuffer(bytes)
  if (!detected || !config.UPLOAD_ALLOWED_MIME_TYPES.includes(detected.mime)) throw new Error('Unsupported image type')
  return { bytes, mime: detected.mime, size }
}

/** Deterministic object keys recover uploads completed before a process/database failure. */
export const importImages = async (
  migrationId: string, code: string, owners: ImageOwner[], log: MigrationLog, assertActive: () => void,
) => {
  const db = privilegedDb(prisma)
  for (const owner of owners) {
    const provenance = await db.migrationEvent.findFirst({ where: {
      step: 'create',
      AND: [
        { data: { path: ['resourceId'], equals: owner.id } },
        { data: { path: ['resourceType'], equals: owner.type } },
      ],
    } })
    const record = owner.type === 'groups'
      ? await db.group.findUniqueOrThrow({ where: { id: owner.id } })
      : owner.type === 'members'
        ? await db.member.findUniqueOrThrow({ where: { id: owner.id } })
        : await db.post.findUniqueOrThrow({ where: { id: owner.id } })
    const current = 'images' in record ? record.images : record.image
    const previous = await db.migrationEvent.findFirst({ where: {
      step: 'images', AND: [
        { data: { path: ['resourceId'], equals: owner.id } },
        { data: { path: ['resourceType'], equals: owner.type } },
      ],
    }, orderBy: { id: 'desc' } })
    const lastImages = (previous?.data as { images?: Prisma.JsonValue } | undefined)?.images ?? null
    const destinationUrls = owner.urls.map(url => `${publicUrlBase}/${imageKey(code, owner, url)}`)
    // Only finish images on migration-created resources, while preserving subsequent manual edits.
    if (!provenance || JSON.stringify(current) !== JSON.stringify(lastImages)) {
      await log('info', 'images', `Preserved existing images on ${owner.type} ${owner.id}`)
      continue
    }
    const images: { url: string }[] = []
    for (const [position, source] of owner.urls.entries()) {
      const key = imageKey(code, owner, source)
      const url = destinationUrls[position]
      let object = await getS3ObjectMetadata(key)
      if (!object) {
        let image: Awaited<ReturnType<typeof download>>
        try {
          image = await download(source)
        } catch (error) {
          await log('warn', 'images', `Omitted image on ${owner.type} ${owner.id}: ${(error as Error).message}`, { source, position })
          continue
        }
        assertActive()
        await uploadToS3(key, image.mime, image.bytes)
        object = image
      }
      const file = await db.file.findFirst({ where: { tenantId: code, key } })
      assertActive()
      if (!file) await db.file.create({ data: {
        tenantId: code, key, url, mime: object.mime, size: object.size,
        filename: new URL(source).pathname.split('/').pop()?.slice(0, 255) || 'image',
        resourceType: owner.type, resourceId: owner.id, uploaderId: owner.uploaderId,
        created: record.created, updated: record.updated,
      } })
      images.push({ url })
    }
    const value = 'images' in record ? images : images[0] ?? null
    await db.transaction(async tx => {
      assertActive()
      if (JSON.stringify(current) !== JSON.stringify(value)) {
        const image = images[0] ?? Prisma.DbNull
        if (owner.type === 'groups') {
          await tx.group.update({ where: { id: owner.id }, data: { image, updated: record.updated } })
        } else if (owner.type === 'members') {
          await tx.member.update({ where: { id: owner.id }, data: { image, updated: record.updated } })
        } else {
          await tx.post.update({ where: { id: owner.id }, data: { images, updated: record.updated } })
        }
      }
      // Keep the last imported value with the update to distinguish retries from manual image edits.
      await tx.migrationEvent.create({ data: {
        migrationId, level: 'info', step: 'images', message: `Images ready for ${owner.type} ${owner.id}`,
        data: { resourceType: owner.type, resourceId: owner.id, images: value, copied: images.length, total: owner.urls.length },
      } })
    })
  }
}
