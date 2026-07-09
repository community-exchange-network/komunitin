import express, { Router, Response } from 'express'
import { z } from 'zod'
import prisma from '../utils/prisma'
import { consumeActionToken, findValidActionToken, userActionTokenPurpose } from '../services/tokens'
import { NotificationsService } from '../services/notifications'
import { rateLimit } from '../utils/rate-limit'
import { userAuth, type AuthenticatedRequest } from '../server/auth'
import { badRequest } from '../utils/error'
import logger from '../utils/logger'
import { normalizeEmail, normalizedEmailSchema } from '../utils/email'

const router = Router()
const parseBody = express.json()
const emailPayloadSchema = z.object({ email: normalizedEmailSchema })
const tokenPayloadSchema = z.object({ token: z.string().min(1) })

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

    await NotificationsService.sendValidationEmail(userId, email)

    res.json({ status: 'ok' })
  } catch (err) {
    next(err)
  }
})

router.post('/change-email/confirm', parseBody, rateLimit({ bucket: 'change-email-confirm' }), async (req, res, next) => {
  const parsed = tokenPayloadSchema.safeParse(req.body)
  if (!parsed.success) {
    return next(badRequest('Missing token'))
  }
  const { token } = parsed.data

  try {
    const changeRecord = await findValidActionToken(token, [
      userActionTokenPurpose.emailChange,
      userActionTokenPurpose.emailVerification,
    ])

    if (!changeRecord || !changeRecord.targetEmail) {
      return next(badRequest('Invalid or expired token'))
    }
    const targetEmail = normalizeEmail(changeRecord.targetEmail)

    const existing = await prisma.user.findUnique({ where: { email: targetEmail } })
    if (existing && existing.id !== changeRecord.userId) {
      return next(badRequest('Email is already taken'))
    }

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: changeRecord.userId },
        data: {
          email: targetEmail,
          emailVerified: true,
        },
      })
      await consumeActionToken(tx, changeRecord)
    })

    res.json({ status: 'ok' })
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

    res.json({ status: 'ok' })
    NotificationsService.sendValidationEmail(user.id, user.email).catch(err => {
      logger.error({ err }, 'Failed to send validation email in background')
    })
  } catch (err) {
    next(err)
  }
})

export default router
