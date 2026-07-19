import type { ErrorRequestHandler } from 'express'
import { UnauthorizedError } from 'express-oauth2-jwt-bearer'
import logger from '../utils/logger'
import { KError, badRequest, forbidden, internalError, unauthorized } from '../utils/error'

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
  let kerror: KError

  if (err instanceof KError) {
    kerror = err
  } else if (err instanceof UnauthorizedError) {
    if (err.status === 400) {
      kerror = badRequest(err.message, { cause: err })
    } else if (err.status === 401) {
      kerror = unauthorized(err.message, { cause: err })
    } else if (err.status === 403) {
      kerror = forbidden(err.message, { cause: err })
    } else {
      kerror = internalError(err.message, { cause: err })
    }
  } else {
    kerror = internalError(err?.message ?? 'Unexpected error', { cause: err })
  }

  res.status(kerror.getStatus()).json(toJsonApiError(kerror))
}
