import pino from 'pino'
import pinoHttp from 'pino-http'

const filterObjectKeys = (obj: Record<string, any> | undefined, keys: string[]) => {
  return obj === undefined ? undefined : Object.fromEntries(
    Object.entries(obj).filter(([key]) => keys.includes(key))
  )
}

const redacted = '[REDACTED]'

const redactActionToken = (url: string): string => {
  const parsed = new URL(url, 'http://localhost')
  if (!parsed.searchParams.has('token')) {
    return url
  }
  parsed.searchParams.set('token', redacted)
  return url.startsWith('/')
    ? `${parsed.pathname}${parsed.search}${parsed.hash}`
    : parsed.toString()
}

export const serializeRequest = (req: any) => {
  const headers = filterObjectKeys(
    req.raw.headers,
    ['host', 'user-agent', 'x-forwarded-for', 'referer']
  )
  if (typeof headers?.referer === 'string') {
    headers.referer = redactActionToken(headers.referer)
  }

  return {
    ...req,
    url: redactActionToken(req.url),
    query: Object.hasOwn(req.query, 'token')
      ? { ...req.query, token: redacted }
      : req.query,
    headers
  }
}

export const httpLogger = pinoHttp({
  serializers: {
    req: pino.stdSerializers.wrapRequestSerializer(serializeRequest),
    res: pino.stdSerializers.wrapResponseSerializer((res: any) => {
      return {
        statusCode: res.raw.statusCode,
        headers: filterObjectKeys(res.raw.headers, ['content-type', 'content-length'])
      }
    })
  }
})
