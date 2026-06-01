import express, { Router } from 'express'
import prisma from '../utils/prisma'
import { createPasswordResetToken, findPasswordResetByToken, hasExpired, hashPassword } from '../services/password'
import { NotificationsService } from '../services/notifications'
import { rateLimit } from '../utils/rate-limit'
import { badRequest } from '../utils/error'
import logger from '../utils/logger'

const router = Router()
const parseBody = [
  express.urlencoded({ extended: false }),
  express.json({
    type: ['application/vnd.api+json', 'application/json'],
  }),
]

router.post('/reset-password', ...parseBody, rateLimit({ bucket: 'reset-password' }), async (req, res, next) => {
  const { email } = req.body
  if (!email || typeof email !== 'string') {
    return next(badRequest('Missing or invalid email'))
  }

  try {
    const result = await createPasswordResetToken(email)
    res.json({ status: 'ok' })
    
    if (result) {
      NotificationsService.sendPasswordResetEmail(result.userId, result.token).catch(err => {
        logger.error({ err }, 'Failed to send password reset email in background')
      })
    }
  } catch (err) {
    next(err)
  }
})

router.post('/change-password', ...parseBody, rateLimit({ bucket: 'change-password' }), async (req, res, next) => {
  const { token, password } = req.body
  if (!token || typeof token !== 'string') {
    return next(badRequest('Missing reset token'))
  }
  if (!password || typeof password !== 'string') {
    return next(badRequest('Missing new password'))
  }

  try {
    const resetRecord = await findPasswordResetByToken(token)

    if (!resetRecord || resetRecord.usedAt !== null || hasExpired(resetRecord.expiresAt)) {
      return next(badRequest('Invalid or expired reset token'))
    }

    const passwordHash = await hashPassword(password)

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetRecord.userId },
        data: { passwordHash },
      }),
      prisma.userActionToken.update({
        where: { id: resetRecord.id },
        data: { usedAt: new Date() },
      }),
      prisma.userActionToken.deleteMany({
        where: {
          userId: resetRecord.userId,
          purpose: resetRecord.purpose,
          usedAt: null,
          id: { not: resetRecord.id },
        },
      }),
    ])

    res.json({ status: 'ok' })
  } catch (err) {
    next(err)
  }
})

export default router
