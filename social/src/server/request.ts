import { Request } from "express"

export const getParam = (req: Request, name: string): string => {
  const value = req.params[name]
  const param = Array.isArray(value) ? value[0] : value
  if (!param) {
    throw new Error(`Missing route param: ${name}`)
  }

  return param
}

export const getCode = (req: Request): string => {
  return getParam(req, 'code')
}

export const getInclude = (req: Request, relationships: string[]) => {
  const include: string[] = []
  if (typeof req.query.include == 'string') {
    include.push(...(req.query.include.split(",")))
  } else if (Array.isArray(req.query.include)) {
    include.push(...(req.query.include as string[]))
  }
  return relationships.filter(r => include.includes(r))
}