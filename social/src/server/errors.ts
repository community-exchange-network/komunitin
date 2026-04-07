import type { ErrorRequestHandler } from 'express'
import logger from '../utils/logger'
import { KError, internalError } from '../utils/error'

interface JsonApiErrorObject {
  errors: {
    status: string
    code: string
    title: string
    detail: string
  }[]
}

const toJsonApiError = (kerror: KError): JsonApiErrorObject => ({
  errors: [{
    status: kerror.getStatus().toString(),
    code: kerror.code,
    title: kerror.getTitle(),
    detail: kerror.message
  }]
})

export const errorHandler: ErrorRequestHandler = (err, req, res, next) => {
  logger.error(err)
  const kerror = err instanceof KError ? err : internalError(err?.message ?? 'Unexpected error', { cause: err })
  res.status(kerror.getStatus()).json(toJsonApiError(kerror))
}
