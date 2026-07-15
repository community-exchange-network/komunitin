import express, { Router } from 'express'
import { z } from 'zod'
import prisma from '../utils/prisma'
import {
  consumeActionToken,
  findValidActionToken,
  hashPassword,
  userActionTokenPurpose,
} from '../services/tokens'
import { NotificationsService } from '../services/notifications'
import { rateLimit } from '../utils/rate-limit'
import { badRequest } from '../utils/error'
import logger from '../utils/logger'
import { normalizedEmailSchema } from '../utils/email'
import { revokeUserSessions } from '../oidc/adapter'

const router = Router()
const parseBody = express.json()
const emailPayloadSchema = z.object({ email: normalizedEmailSchema })
const resetTokenPayloadSchema = z.object({ token: z.string().min(1) })
const passwordPayloadSchema = z.object({ password: z.string().min(1) })

router.post('/reset-password', parseBody, rateLimit({ bucket: 'reset-password' }), async (req, res, next) => {
  const parsed = emailPayloadSchema.safeParse(req.body)
  if (!parsed.success) {
    return next(badRequest('Missing or invalid email'))
  }
  const { email } = parsed.data

  try {
    const user = await prisma.user.findUnique({ where: { email } })
    res.json({ status: 'ok' })

    if (user) {
      NotificationsService.sendPasswordResetEmail(user.id, user.email).catch(err => {
        logger.error({ err }, 'Failed to send password reset email in background')
      })
    }
  } catch (err) {
    next(err)
  }
})

router.post('/change-password', parseBody, rateLimit({ bucket: 'change-password' }), async (req, res, next) => {
  const tokenParsed = resetTokenPayloadSchema.safeParse(req.body)
  if (!tokenParsed.success) {
    return next(badRequest('Missing reset token'))
  }
  const passwordParsed = passwordPayloadSchema.safeParse(req.body)
  if (!passwordParsed.success) {
    return next(badRequest('Missing new password'))
  }
  const { token } = tokenParsed.data
  const { password } = passwordParsed.data

  try {
    const resetRecord = await findValidActionToken(token, userActionTokenPurpose.passwordReset)

    if (!resetRecord) {
      return next(badRequest('Invalid or expired reset token'))
    }

    const passwordHash = await hashPassword(password)

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash },
      })
      await consumeActionToken(tx, resetRecord)
      await revokeUserSessions(tx, resetRecord.userId)
    })

    res.json({ status: 'ok' })
  } catch (err) {
    next(err)
  }
})

export default router
