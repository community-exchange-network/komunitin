import { Request } from "express"

// We use the the classic limit-offset pagination. This is the strategy that 
// offers more flexibility since we can order the dataset by any field. The
// parameters are page[size] and page[after].

const DEFAULT_PAGE_SIZE = 20
const MAX_PAGE_SIZE = 200

export const pagination = (req: Request) => {
  let size = DEFAULT_PAGE_SIZE
  let cursor = 0

  const page = req.query.page as any
  if (page) {
    // Parse size
    if (page.size) {
      const inputSize = parseInt(page.size)
      if (inputSize > 0 && inputSize <= MAX_PAGE_SIZE) {
        size = inputSize
      }
    }
    if (page.after) {
      const inputAfter = parseInt(page.after)
      if (inputAfter >= 0) {
        cursor = inputAfter
      }
    }
  }
  return {cursor, size}
}
