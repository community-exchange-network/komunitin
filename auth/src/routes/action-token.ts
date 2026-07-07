import express, { Router } from 'express'
import { z } from 'zod'
import { notificationsServiceAuth, socialServiceAuth } from '../server/auth'
import {
  createEmailChangeToken,
  createEmailVerificationToken,
  createPasswordResetTokenForUser,
  createUnsubscribeToken,
  redeemActionToken,
  userActionTokenPurpose,
} from '../services/tokens'
import { badRequest } from '../utils/error'
import prisma from '../utils/prisma'

const router = Router()

const actionTokenPayloadSchema = z.discriminatedUnion('purpose', [
  z.object({
    purpose: z.enum([
      userActionTokenPurpose.passwordReset,
      userActionTokenPurpose.emailVerification,
      userActionTokenPurpose.unsubscribe,
    ]),
    userId: z.uuid(),
  }),
  z.object({
    purpose: z.literal(userActionTokenPurpose.emailChange),
    userId: z.uuid(),
    email: z.email(),
  }),
])

router.post('/action-token', express.json(), notificationsServiceAuth, async (req, res, next) => {
  const parsed = actionTokenPayloadSchema.safeParse(req.body)
  if (!parsed.success) {
    return next(badRequest('Invalid action token request'))
  }

  const { purpose, userId } = parsed.data

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user) {
      return next(badRequest('Unknown user'))
    }

    let token: string
    let email = user.email

    if (purpose === userActionTokenPurpose.passwordReset) {
      token = await createPasswordResetTokenForUser(user.id)
    } else if (purpose === userActionTokenPurpose.emailChange) {
      email = parsed.data.email
      token = await createEmailChangeToken(user.id, email)
    } else if (purpose === userActionTokenPurpose.emailVerification) {
      token = await createEmailVerificationToken(user.id, user.email)
    } else {
      token = await createUnsubscribeToken(user.id)
    }

    res.json({ token, email })
  } catch (err) {
    next(err)
  }
})

const redeemActionTokenPayloadSchema = z.object({
  token: z.string().min(1),
  purpose: z.literal(userActionTokenPurpose.unsubscribe),
})

router.post('/redeem-action-token', express.json(), socialServiceAuth, async (req, res, next) => {
  const parsed = redeemActionTokenPayloadSchema.safeParse(req.body)
  if (!parsed.success) {
    return next(badRequest('Invalid redeem action token request'))
  }

  const { token, purpose } = parsed.data

  try {
    const redeemed = await redeemActionToken(token, purpose)
    if (!redeemed) {
      return next(badRequest('Invalid or expired action token'))
    }

    res.json(redeemed)
  } catch (err) {
    next(err)
  }
})

export default router
