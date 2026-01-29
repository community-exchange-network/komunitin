import pino from "pino"
import pinoHttp from "pino-http"

const filterObjectKeys = (obj: Record<string, any> | undefined, keys: string[]) => {
  return obj === undefined ? undefined : Object.fromEntries(
    Object.entries(obj).filter(([key]) => keys.includes(key))
  )
}

export const httpLogger = pinoHttp({
  serializers: {
    req: pino.stdSerializers.wrapRequestSerializer((req) => {
      return {
        ...req,
        headers: filterObjectKeys(req.raw.headers, ["host", "user-agent", "x-forwarded-for", "referer"])
      }
    }),
    res: pino.stdSerializers.wrapResponseSerializer((res: any) => {
      return {
        statusCode: res.raw.statusCode,
        headers: filterObjectKeys(res.raw.headers, ["content-type", "content-length"])
      }
    })
  }
})
