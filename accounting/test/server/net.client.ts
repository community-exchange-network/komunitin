import { Scope } from "src/server/auth"
import { Express } from "express"
import request, { Response, Request } from "supertest"
import assert from "node:assert"
import { token } from "./auth.mock"
import { config } from "src/config"

/**
 * Normalize URL for test comparison
 */
export function norl(url: string) {
  // Absolute URL.
  const urlObj = new URL(url, config.API_BASE_URL)
  // Sort query string args & normalize the encoding of the URL
  urlObj.searchParams.sort()
  const norm = urlObj.href.replace(config.API_BASE_URL, "")
  return norm
}

export type AuthInfo = {user: string|null, scopes: Scope[], audience?: string, ccNode?: string, lastHash?: string}
export function client(app: Express) {
  const completeRequest = async (req: Request, auth?: AuthInfo, status: number = 200) => {
    if (auth && typeof auth === "object") {
      const access = await token(auth.user, auth.scopes, auth.audience)
      req.set('Authorization', `Bearer ${access}`)
      if (auth.ccNode) {
        req.set('cc-node', auth.ccNode)
      }
      if (typeof auth.lastHash !== 'undefined') {
        req.set('last-hash', auth.lastHash)
      }
    }

    const response = (await req) as Response
    assert.equal(response.status, status, response.body.errors?.[0]?.detail ?? response.status)
    assert(response.header['content-type'].startsWith("application/vnd.api+json"), "Incorrect content type")
    return response
  }

  const sendData = (req: Request, data: any) => {
    return req.send(data).set('Content-Type', 'application/vnd.api+json')
  }

  return {
    get: async (path: string, auth?: AuthInfo, status: number = 200) => {
      return await completeRequest(
        request(app).get(path), 
        auth, status)
    },
    post: async (path: string, data: any, auth?: AuthInfo, status: number = 201) => {
      return await completeRequest(
        sendData(request(app).post(path), data),
        auth, status)
    },
    patch: async (path: string, data: any, auth?: AuthInfo, status: number = 200) => {
      return await completeRequest(
        sendData(request(app).patch(path), data),
        auth, status)
    },
    delete: async (path: string, auth?: AuthInfo, status: number = 204) => {
      return await completeRequest(
        request(app).delete(path),
        auth, status)
    }
  }
}

export type TestApiClient = ReturnType<typeof client>