import {config} from "../../src/config"
import {http, HttpResponse} from "msw"
import { jwks } from "./auth.mock"
import { setupServer, SetupServerApi } from 'msw/node'
import { logger } from "src/utils/logger"
import request from "supertest"
import { Express } from "express"
import TestAgent from "supertest/lib/agent"


const events: any[] = []

export const getEvents = () => events
export const clearEvents = () => events.splice(0, events.length)


const pipeRequest = async (info: any, app: any, method: (r: TestAgent, path: string) => any) => {
  const url = info.request.url
  const path = url.substring(config.API_BASE_URL.length)
  const body = info.request.body ? await info.request.json() as any : null

  const headers = {} as Record<string, string>
  info.request.headers.forEach((value: any, key: any) => {
    headers[key] = value
  })
  const req = method(request(app), path).set(headers)
  
  if (body) {
    req.send(body)
  }

  const response = await req

  return HttpResponse.json(response.body, { status: response.status })
}

const getHandlers = (app: Express) => [
  
  // Mock the JWKS endpoint from Auth Server
  http.get(config.AUTH_JWKS_URL, () => {
    return HttpResponse.json(jwks())
  }),

  // Mock notifications service events endpoint.
  http.post(`${config.NOTIFICATIONS_API_URL}/events`, async (info) => {
    const doc = (await new Response(info.request.body).json()) as any
    const event = doc.data
    event.id = (events.length + 1).toString()
    events.push(event)
    logger.info(event, "Event sent to notifications service")
    return HttpResponse.json(doc, { status: 201 })
  }),

  // Redirect requests to the API server itself (for external resources) to
  // the test server interface.
  http.get(`${config.API_BASE_URL}/*`, async (info) => {
    return pipeRequest(info, app, (r, path) => r.get(path))
  }),

  http.post(`${config.API_BASE_URL}/*`, async (info) => {
    return pipeRequest(info, app, (r, path) => r.post(path))
  }),

  http.patch(`${config.API_BASE_URL}/*`, async (info) => {
    return pipeRequest(info, app, (r, path) => r.patch(path))
  })
]

let server: SetupServerApi;

export const startServer = (app: Express) => {
  const handlers = getHandlers(app)
  server = setupServer(...handlers)
  server.listen({ onUnhandledRequest: "bypass" })
}

export const stopServer = () => {
  server.close()
}
