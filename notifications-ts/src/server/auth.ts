import { InvalidTokenError, auth as authJwt } from "express-oauth2-jwt-bearer"
import { config } from "../config"
import { NextFunction, Request, Response } from "express"
import logger from "../utils/logger"

const buildJwt = () => {
  return authJwt({
    issuer: config.AUTH_JWT_ISSUER,
    audience: config.AUTH_JWT_AUDIENCE,
    jwksUri: config.AUTH_JWKS_URL,
    validators: {
      // IntegralCES creates JWTs with a null sub claim for the tokens
      // requested by the notifications service. The default validator
      // in express-oauth2-jwt-bearer does not allow null values for 
      // the sub claim. But this service is never reached from notifications
      // service, so we are fine with default sub validation.
      // sub: (sub) => typeof sub === "string" || sub === null,
      
      // IntegralCES may append the language code to the issuer claim (!),
      // so we need to allow for that instead of strict equality.
      iss: (iss) => typeof iss === "string" && iss.startsWith(config.AUTH_JWT_ISSUER), 
    },
  })
}

let jwt = buildJwt()
let lastInvalidTokenRetry = 0

/**
 * Require a valid JWT token in the request.
 */
export const userAuth = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    jwt(req, res, (err) => {
      if (err) {
        if (err instanceof InvalidTokenError && lastInvalidTokenRetry < Date.now() - 1000 * 60 * 5) {
          // In this case it could be possible that the error is "signature verification failed" because the token
          // is signed with a newly rotated key that is still not used because the jwks cache is not updated.
          // Note that in order to prevent abuse, we only retry once every 5 minutes.
          lastInvalidTokenRetry = Date.now()
          jwt = buildJwt()
          logger.warn("Invalid token error. Refreshing JWKS.")
          jwt(req, res, next)
        } else {
          next(err)
        }
      } else {
        next()
      }
    })
  }
}
