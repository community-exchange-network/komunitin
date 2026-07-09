import express, { Router } from 'express'
import { z } from 'zod'
import prisma from '../utils/prisma'
import { hashPassword } from '../services/tokens'
import { NotificationsService } from '../services/notifications'
import { rateLimit } from '../utils/rate-limit'
import { badRequest, conflict } from '../utils/error'
import logger from '../utils/logger'
import { normalizedEmailSchema } from '../utils/email'

const router = Router()
const parseBody = express.json()
const registerPayloadSchema = z.object({
  email: normalizedEmailSchema,
  password: z.string().min(1),
})

const duplicateEmail = () => conflict('Email is already registered')

const isUniqueConstraintError = (err: unknown) => {
  return typeof err === 'object'
    && err !== null
    && 'code' in err
    && err.code === 'P2002'
}

router.post('/register', parseBody, rateLimit({ bucket: 'register', limit: 1, windowMs: 60 * 1000 }), async (req, res, next) => {
  const parsed = registerPayloadSchema.safeParse(req.body)
  if (!parsed.success) {
    return next(badRequest('Missing or invalid registration payload'))
  }
  const { email, password } = parsed.data

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return next(duplicateEmail())
    }

    const passwordHash = await hashPassword(password)
    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        emailVerified: false,
        status: 'active',
      },
      select: {
        id: true,
        email: true,
        emailVerified: true,
      },
    })

    res.status(201).json(user)
    NotificationsService.sendValidationEmail(user.id, user.email).catch(err => {
      logger.error({ err }, 'Failed to send validation email in background')
    })
  } catch (err) {
    if (isUniqueConstraintError(err)) {
      return next(duplicateEmail())
    }
    next(err)
  }
})

export default router
