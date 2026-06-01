import express, { Router, Response } from 'express'
import prisma from '../utils/prisma'
import {
  createEmailChangeToken,
  createEmailVerificationToken,
  findEmailActionByToken,
  hasExpired,
  userActionTokenPurpose,
} from '../services/password'
import { NotificationsService } from '../services/notifications'
import { rateLimit } from '../utils/rate-limit'
import { userAuth, AuthenticatedRequest } from './auth-middleware'
import { badRequest } from '../utils/error'
import logger from '../utils/logger'

const router = Router()
const parseBody = [
  express.urlencoded({ extended: false }),
  express.json({
    type: ['application/vnd.api+json', 'application/json'],
  }),
]

router.post('/change-email', ...parseBody, userAuth, rateLimit({ bucket: 'change-email' }), async (req: AuthenticatedRequest, res: Response, next) => {
  const { email } = req.body
  if (!email || typeof email !== 'string') {
    return next(badRequest('Missing or invalid new email'))
  }

  const userId = req.user!.id

  try {
    const existing = await prisma.user.findUnique({ where: { email } })
    if (existing) {
      return next(badRequest('Email is already taken'))
    }

    const token = await createEmailChangeToken(userId, email)
    await NotificationsService.sendValidationEmail(userId, token)

    res.json({ status: 'ok' })
  } catch (err) {
    next(err)
  }
})

router.post('/change-email/confirm', ...parseBody, rateLimit({ bucket: 'change-email-confirm' }), async (req, res, next) => {
  const { token } = req.body
  if (!token || typeof token !== 'string') {
    return next(badRequest('Missing token'))
  }

  try {
    const changeRecord = await findEmailActionByToken(token)

    if (!changeRecord || !changeRecord.targetEmail || changeRecord.usedAt !== null || hasExpired(changeRecord.expiresAt)) {
      return next(badRequest('Invalid or expired token'))
    }

    const existing = await prisma.user.findUnique({ where: { email: changeRecord.targetEmail } })
    if (existing && existing.id !== changeRecord.userId) {
      return next(badRequest('Email is already taken'))
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: changeRecord.userId },
        data: {
          email: changeRecord.targetEmail,
          emailVerified: true,
        },
      }),
      prisma.userActionToken.update({
        where: { id: changeRecord.id },
        data: { usedAt: new Date() },
      }),
      prisma.userActionToken.deleteMany({
        where: {
          userId: changeRecord.userId,
          purpose: changeRecord.purpose,
          usedAt: null,
          id: { not: changeRecord.id },
        },
      }),
    ])

    res.json({ status: 'ok' })
  } catch (err) {
    next(err)
  }
})

router.post('/resend-validation', ...parseBody, rateLimit({ bucket: 'resend-validation' }), async (req, res, next) => {
  const { email } = req.body
  if (!email || typeof email !== 'string') {
    return next(badRequest('Missing or invalid email'))
  }

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    if (!user) {
      return res.json({ status: 'ok' })
    }

    if (user.emailVerified) {
      const pendingChange = await prisma.userActionToken.findFirst({
        where: {
          userId: user.id,
          purpose: userActionTokenPurpose.emailChange,
          usedAt: null,
          expiresAt: { gt: new Date() },
        },
        orderBy: { createdAt: 'desc' },
      })
      res.json({ status: 'ok' })
      if (pendingChange?.targetEmail) {
        const token = await createEmailChangeToken(user.id, pendingChange.targetEmail)
        NotificationsService.sendValidationEmail(user.id, token).catch(err => {
          logger.error({ err }, 'Failed to send validation email in background')
        })
      }
      return
    }

    const token = await createEmailVerificationToken(user.id, user.email)
    res.json({ status: 'ok' })
    NotificationsService.sendValidationEmail(user.id, token).catch(err => {
      logger.error({ err }, 'Failed to send validation email in background')
    })
  } catch (err) {
    next(err)
  }
})

export default router
