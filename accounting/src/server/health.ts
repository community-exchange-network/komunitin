import { BaseService } from "../controller"
import { Request, Response } from "express"

export const healthRoute = (service: BaseService) => async (_req: Request, res: Response) => {
  try {
    const db = service.privilegedDb()
    await db.$queryRaw`SELECT 1`
    res.json({ status: "ok" })
  } catch {
    res.status(503).json({ status: "error" })
  }
}
