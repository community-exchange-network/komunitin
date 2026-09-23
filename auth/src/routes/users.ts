import { Router } from 'express'
import { z } from 'zod'
import { socialServiceAuth } from '../server/auth'
import { revokeUserSessions } from '../oidc/adapter'
import { badRequest } from '../utils/error'
import prisma from '../utils/prisma'

const router = Router()

// Social owns the remaining-membership check; only its service principal can delete identities.
router.delete('/users/:id', socialServiceAuth, async (req, res, next) => {
  const parsed = z.uuid().safeParse(req.params.id)
  if (!parsed.success) {
    return next(badRequest('Invalid user ID'))
  }
  const userId = parsed.data
  try {
    await prisma.$transaction(async (tx) => {
      await revokeUserSessions(tx, userId)
      // Action tokens cascade with the identity. deleteMany makes retries idempotent.
      await tx.user.deleteMany({ where: { id: userId } })
    })
    res.sendStatus(204)
  } catch (err) {
    next(err)
  }
})

export default router
