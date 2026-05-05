import { http, HttpResponse } from 'msw'
import { getJwks } from './auth'

export const handlers = [
  http.get(process.env.AUTH_JWKS_URL!, () => {
    return HttpResponse.json(getJwks())
  }),
]
