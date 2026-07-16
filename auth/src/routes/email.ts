import express, { Router, Response } from 'express'
import { z } from 'zod'
import prisma from '../utils/prisma'
import {
  consumeActionToken,
  findActionToken,
  hasExpired,
  userActionTokenPurpose,
} from '../services/tokens'
import { NotificationsService } from '../services/notifications'
import { rateLimit } from '../utils/rate-limit'
import { userAuth, type AuthenticatedRequest } from '../server/auth'
import { badRequest } from '../utils/error'
import logger from '../utils/logger'
import { normalizeEmail, normalizedEmailSchema } from '../utils/email'
import { revokeUserSessions } from '../oidc/adapter'
import { signupContextSchema } from '../users/signup'

const router = Router()
const parseBody = express.json()
const emailPayloadSchema = z.object({ email: normalizedEmailSchema })
const tokenPayloadSchema = z.object({ token: z.string().min(1) })
const confirmedUserSelect = {
  id: true,
  email: true,
  emailVerified: true,
} as const

router.post('/change-email', parseBody, userAuth, rateLimit({ bucket: 'change-email' }), async (req: AuthenticatedRequest, res: Response, next) => {
  const parsed = emailPayloadSchema.safeParse(req.body)
  if (!parsed.success) {
    return next(badRequest('Missing or invalid new email'))
  }
  const { email } = parsed.data

  const userId = req.user!.id

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return next(badRequest('Email is already taken'))
    }

    await NotificationsService.sendValidationEmail(userId, email, userActionTokenPurpose.emailChange)

    res.json({ status: 'ok' })
  } catch (err) {
    next(err)
  }
})

router.post('/email/confirm', parseBody, rateLimit({ bucket: 'email-confirm' }), async (req, res, next) => {
  const parsed = tokenPayloadSchema.safeParse(req.body)
  if (!parsed.success) {
    return next(badRequest('Missing token'))
  }
  const { token } = parsed.data

  try {
    const emailActionToken = await findActionToken(token, [
      userActionTokenPurpose.emailChange,
      userActionTokenPurpose.emailVerification,
    ])

    if (!emailActionToken || !emailActionToken.targetEmail || hasExpired(emailActionToken.expiresAt)) {
      return next(badRequest('Invalid or expired token'))
    }
    const targetEmail = normalizeEmail(emailActionToken.targetEmail)
    const signup = signupContextSchema.safeParse(emailActionToken.data)

    switch (emailActionToken.purpose) {
      case userActionTokenPurpose.emailVerification: {
        // Allow reusing a consumed email verification token.
        if (emailActionToken.usedAt !== null) {
          const user = await prisma.user.findUnique({
            where: { id: emailActionToken.userId },
            select: confirmedUserSelect,
          })
          if (!user || !user.emailVerified || user.email !== targetEmail) {
            return next(badRequest('Invalid or expired token'))
          }
          return res.json({ ...user, ...(signup.success ? { signup: signup.data } : {}) })
        }
        
        break
      }
      case userActionTokenPurpose.emailChange:
        if (emailActionToken.usedAt !== null) {
          return next(badRequest('Invalid or expired token'))
        }
        break
      default:
        return next(badRequest('Invalid or expired token'))
    }

    const existing = await prisma.user.findUnique({ where: { email: targetEmail } })
    if (existing && existing.id !== emailActionToken.userId) {
      return next(badRequest('Email is already taken'))
    }

    const user = await prisma.$transaction(async (tx) => {
      const updatedUser = await tx.user.update({
        where: { id: emailActionToken.userId },
        data: {
          email: targetEmail,
          emailVerified: true,
        },
        select: confirmedUserSelect,
      })
      await consumeActionToken(tx, emailActionToken)
      if (emailActionToken.purpose === userActionTokenPurpose.emailChange) {
        await revokeUserSessions(tx, emailActionToken.userId)
      }
      return updatedUser
    })

    res.json({ ...user, ...(signup.success ? { signup: signup.data } : {}) })
  } catch (err) {
    next(err)
  }
})

router.post('/resend-validation', parseBody, rateLimit({ bucket: 'resend-validation' }), async (req, res, next) => {
  const parsed = emailPayloadSchema.safeParse(req.body)
  if (!parsed.success) {
    return next(badRequest('Missing or invalid email'))
  }
  const { email } = parsed.data

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user || user.emailVerified) {
      return res.json({ status: 'ok' })
    }

    const currentToken = await prisma.userActionToken.findFirst({
      where: {
        userId: user.id,
        purpose: userActionTokenPurpose.emailVerification,
      },
      orderBy: { createdAt: 'desc' },
      select: { data: true },
    })
    const signup = signupContextSchema.safeParse(currentToken?.data)
    res.json({ status: 'ok' })
    NotificationsService.sendValidationEmail(
      user.id,
      user.email,
      userActionTokenPurpose.emailVerification,
      signup.success ? signup.data : undefined,
    ).catch(err => {
      logger.error({ err }, 'Failed to send validation email in background')
    })
  } catch (err) {
    next(err)
  }
})

export default router
