import { Request } from "express"

export const include = (req: Request, relationships: string[]) => {
  const include: string[] = []
  if (typeof req.query.include == 'string') {
    include.push(...(req.query.include.split(",")))
  } else if (Array.isArray(req.query.include)) {
    include.push(...(req.query.include as string[]))
  }
  return relationships.filter(r => include.includes(r))
}