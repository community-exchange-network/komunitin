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
  let kerror: KError

  if (err instanceof KError) {
    kerror = err
  } else {
    kerror = internalError(undefined, { cause: err })
  }

  res.status(kerror.getStatus()).json(toJsonApiError(kerror))
}
