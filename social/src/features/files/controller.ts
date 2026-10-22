import type { RequestHandler } from 'express'
import { getAuthContext } from '../../server/context'
import { getCode } from '../../server/request'
import { serializeFile } from './serializer'
import { createUploadedFile } from './service'

export const postUploadFileRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const file = await createUploadedFile(ctx, code, req)

  const payload = await serializeFile(file)
  res.status(201).json(payload)
}
