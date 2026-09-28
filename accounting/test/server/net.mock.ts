import { Express } from "express"
import { http, HttpResponse, passthrough, RequestHandler } from "msw"
import { setupServer, SetupServerApi } from 'msw/node'
import { logger } from "../../src/utils/logger"
import request from "supertest"
import TestAgent from "supertest/lib/agent"
import { CLIENT_ID, config } from "../../src/config"
import { jwks } from "./auth.mock"

const events: any[] = []
let notificationStatuses: number[] = []

export const getEvents = () => events
export const clearEvents = () => events.splice(0, events.length)
export const setNotificationStatuses = (...statuses: number[]) => {
  notificationStatuses = [...statuses]
}


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

  http.post(`${config.AUTH_URL}/token`, async ({ request }) => {
    const body = new URLSearchParams(await request.text())
    if (
      body.get("client_id") !== CLIENT_ID
      || body.get("client_secret") !== config.ACCOUNTING_CLIENT_SECRET
      || body.get("grant_type") !== "client_credentials"
      || body.get("scope") !== "notifications:write"
    ) {
      return HttpResponse.json({ error: "invalid_client" }, { status: 401 })
    }
    return HttpResponse.json({
      access_token: "accounting-notifications-token",
      expires_in: 3600,
      scope: "notifications:write",
      token_type: "Bearer",
    })
  }),

  // Mock notifications service events endpoint.
  http.post(`${config.NOTIFICATIONS_API_URL}/events`, async (info) => {
    const status = notificationStatuses.shift() ?? 201
    if (status === 401) {
      return HttpResponse.json({ error: "invalid_token" }, { status })
    }
    if (info.request.headers.get("authorization") !== "Bearer accounting-notifications-token") {
      return HttpResponse.json({ error: "invalid_token" }, { status: 401 })
    }
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
  }),

  http.all(`${config.STELLAR_HORIZON_URL}/*`, async () => {
    return passthrough()
  }),
]

let server: SetupServerApi;

export const startServer = (app: Express) => {
  notificationStatuses = []
  const handlers = getHandlers(app)
  server = setupServer(...handlers)
  server.listen({ onUnhandledRequest: "bypass" })
}

export const addHandlers = (...handlers: RequestHandler[]) => {
  server.use(...handlers)
}

export const stopServer = () => {
  server.close()
}
