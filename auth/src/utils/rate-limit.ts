import { Request, Response, NextFunction } from 'express'
import { config } from '../config'

interface RateLimitInfo {
  count: number
  resetTime: number
}

interface RateLimitOptions {
  bucket?: string
  limit?: number
  windowMs?: number
}

const ipLimits = new Map<string, RateLimitInfo>()

// Simple garbage collection for the rate limiter to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [key, info] of ipLimits.entries()) {
    if (now > info.resetTime) {
      ipLimits.delete(key)
    }
  }
}, 60 * 1000).unref() // Run every minute, don't hold the process open

export function resetRateLimits() {
  ipLimits.clear()
}

export function rateLimit(options: RateLimitOptions = {}) {
  const bucket = options.bucket ?? 'default'
  const limit = options.limit ?? config.RATE_LIMIT_MAX_ATTEMPTS
  const windowMs = options.windowMs ?? config.RATE_LIMIT_WINDOW_MS

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown'
    const now = Date.now()
    const key = `${bucket}:${ip}`

    let info = ipLimits.get(key)
    if (!info || now > info.resetTime) {
      info = { count: 0, resetTime: now + windowMs }
    }

    info.count++
    ipLimits.set(key, info)

    if (info.count > limit) {
      const retryAfter = Math.max(1, Math.ceil((info.resetTime - now) / 1000))
      res.setHeader('Retry-After', retryAfter.toString())
      res.status(429).json({
        errors: [{
          status: '429',
          code: 'TooManyRequests',
          title: 'Too Many Requests',
          detail: 'Rate limit exceeded. Please try again later.',
        }],
      })
      return
    }

    next()
  }
}
