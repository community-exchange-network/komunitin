import express, { Router } from 'express'
import { z } from 'zod'
import prisma from '../utils/prisma'
import { hashPassword } from '../services/tokens'
import { NotificationsService } from '../services/notifications'
import { rateLimit } from '../utils/rate-limit'
import { badRequest, conflict } from '../utils/error'
import logger from '../utils/logger'
import { normalizedEmailSchema } from '../utils/email'
import { UserStatus } from '../users/status'
import { revokeUserSessions } from '../oidc/adapter'

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
    const passwordHash = await hashPassword(password)
    const user = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: {
          email,
          emailVerified: false,
        },
        update: { passwordHash },
        create: {
          email,
          passwordHash,
          emailVerified: false,
          status: UserStatus.Active,
        },
        select: {
          id: true,
          email: true,
          emailVerified: true,
        },
      })
      // A verified email conflicts with create but is excluded from update, so the upsert returns no row.
      if (!user) return null

      await tx.userActionToken.deleteMany({
        where: {
          userId: user.id,
          usedAt: null,
        },
      })
      await revokeUserSessions(tx, user.id)

      return user
    })

    if (!user) {
      return next(duplicateEmail())
    }

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
