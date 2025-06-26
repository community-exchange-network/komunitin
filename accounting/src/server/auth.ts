
import { InvalidTokenError, auth as authJwt, scopeIncludesAny } from "express-oauth2-jwt-bearer"
import { config } from "../config"
import { NextFunction, Request, Response } from "express"
import { fixUrl } from "src/utils/net"
import { logger } from "src/utils/logger"
import { unauthorized } from "src/utils/error"
import { verifyExternalToken } from "src/controller/external-jwt"

export enum Scope {
  Accounting = "komunitin_accounting",
  AccountingReadAll = "komunitin_accounting_read_all",
}

const buildJwt = () => {
  return authJwt({
    issuer: config.AUTH_JWT_ISSUER,
    audience: config.AUTH_JWT_AUDIENCE,
    jwksUri: fixUrl(config.AUTH_JWKS_URL),
    validators: {
      // IntegralCES creates JWTs with a null sub claim for the tokens
      // requested by the notifications service. The default validator
      // in express-oauth2-jwt-bearer does not allow null values for 
      // the sub claim.
      sub: (sub) => typeof sub === "string" || sub === null,
      // IntegralCES may append the language code to the issuer claim (!),
      // so we need to allow for that instead of strict equality.
      iss: (iss) => typeof iss === "string" && iss.startsWith(config.AUTH_JWT_ISSUER), 
    },
  })
}

let jwt = buildJwt()
let lastInvalidTokenRetry = 0

/**
 * Require a valid JWT token in the request. If the scopes parameter is provided, require also
 * that the JWT includes at least one of the scopes in the parameter.
 * @param scopes 
 * @returns 
 */
export const userAuth = (scopes?: Scope|Scope[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    handleAuthRequest(scopes, req, res, next)
  }
}

/**
 * Require a valid JWT token in the request. This JWT token is expected to be signed
 * by an account private key and is used to authorize external requests. 
 */
export const externalAuth = () => {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("authorization")
    if (!header) {
      return next(unauthorized("Authorization header is required."))
    }
    const parts = header.split(" ")
    if (parts.length !== 2 || parts[0].toLowerCase() !== "bearer") {
      next(unauthorized("Invalid Authorization header."))
    }
    const token = parts[1]
    verifyExternalToken(token)
      .then((auth) => {
        req.auth = auth
        next()
      })
      .catch(next)
  }
}

type Middleware = (req: Request, res: Response, next: NextFunction) => void

export const anyAuth = (auth1: Middleware, auth2: Middleware) => {
  return (req: Request, res: Response, next: NextFunction) => {
    auth1(req, res, (err) => {
      if (err) {
        auth2(req, res, next)
      } else {
        next()
      }
    })
  }
}

/**
 * Middleware that allows any request without authentication. 
 * 
 * It does nothing but it helps flag the routes that do not require authentication.
 * */
export const noAuth = () => (req: Request, res: Response, next: NextFunction) => {
  next()
}

/**
 * Check the cc-node and last-hash headers against the database, following
 * https://credit-commons.gitlab.io/credit-commons-documentation/#core-concepts
 * */
export const lastHashAuth = () => (req: Request, res: Response, next: NextFunction) => {
  const peerNodePath = req.header("cc-node")
  if (!peerNodePath) {
    return next(unauthorized("cc-node header is required."))
  }
  const lastHash = req.header("last-hash")
  if (!lastHash) {
    return next(unauthorized("last-hash header is required."))
  }
  // Using this auth object so the result is compatible with the other (JWT-based) authentication methods
  req.auth = {
    header: undefined as any,
    token: undefined as any,
    payload: {
      type: 'last-hash',
      peerNodePath,
      lastHash,
    }
  }
  return next()
}

const handleAuthRequest = (scopes: Scope|Scope[]|undefined, req: Request, res: Response, next: NextFunction) => {
  jwt(req, res, (err) => {
    if (err) {
      if (err instanceof InvalidTokenError && lastInvalidTokenRetry < Date.now() - 1000 * 60 * 5) {
        // In this case it could be possible that the error is "signature verification failed" because the token
        // is signed with a newly rotated key that is still not used because the jwks cache is not updated.
        // Note that in order to prevent abuse, we only retry once every 5 minutes.
        lastInvalidTokenRetry = Date.now()
        jwt = buildJwt()
        logger.warn("Invalid token error. Refreshing JWKS.")
        handleAuthRequest(scopes, req, res, next)
      } else {
        next(err)
      }
    } else if (scopes && scopes.length){
       scopeIncludesAny(scopes)(req, res, next)
    } else {
      next()
    }
  })
}

