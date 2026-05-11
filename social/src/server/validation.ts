import type { RequestHandler } from 'express'
import { z } from 'zod'
import { badRequest } from '../utils/error'

export const validateBody = <T>(schema: z.ZodType<T>): RequestHandler => {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body)
    if (!parsed.success) {
      next(badRequest('Invalid request body', { details: z.formatError(parsed.error) }))
      return
    }

    ;(req as any).validatedBody = parsed.data
    next()
  }
}

export const getValidatedBody = <T>(req: any): T => {
  return req.validatedBody as T
}
