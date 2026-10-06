import type { Request } from 'express'
import { mkdtemp, open, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { badRequest } from '../../utils/error'
import { MAX_COMPRESSED_ZIP_BYTES } from './bundle'

/** Stage a bounded upload in a private directory; never use a client-supplied path. */
export const saveBundle = async (req: Request) => {
  if (!req.is('application/zip')) throw badRequest('Expected a CSV ZIP bundle with Content-Type: application/zip')
  const directory = await mkdtemp(join(tmpdir(), 'komunitin-migration-'))
  const path = join(directory, 'bundle.zip')
  try {
    const file = await open(path, 'wx', 0o600)
    try {
      let size = 0
      for await (const chunk of req) {
        size += chunk.length
        if (size > MAX_COMPRESSED_ZIP_BYTES) throw badRequest(`ZIP exceeds ${MAX_COMPRESSED_ZIP_BYTES} bytes`)
        await file.writeFile(chunk)
      }
      if (!size) throw badRequest('A ZIP bundle is required')
    } finally {
      await file.close()
    }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
  return { path, remove: () => rm(directory, { recursive: true, force: true }) }
}
