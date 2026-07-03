import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
import type { Prisma } from '../generated/prisma/client'
import prisma from '../utils/prisma'
import { badRequest } from '../utils/error'

const TOKEN_TTL_MS = 24 * 60 * 60 * 1000

export const userActionTokenPurpose = {
  passwordReset: 'passwordReset',
  emailChange: 'emailChange',
  emailVerification: 'emailVerification',
  unsubscribe: 'unsubscribe',
} as const

export type UserActionTokenPurpose =
  (typeof userActionTokenPurpose)[keyof typeof userActionTokenPurpose]

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw badRequest('Password must be at least 8 characters long')
  }
  return bcrypt.hash(password, 10)
}

export function generateToken(): string {
  return crypto.randomBytes(32).toString('hex')
}

export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex')
}

export function hasExpired(expiresAt: Date): boolean {
  return expiresAt.getTime() <= Date.now()
}

async function findUserActionTokenByToken(
  token: string,
  purposes: UserActionTokenPurpose | UserActionTokenPurpose[],
) {
  const actionToken = await prisma.userActionToken.findUnique({
    where: { tokenHash: hashToken(token) },
  })

  if (!actionToken) return null

  const allowedPurposes = Array.isArray(purposes) ? purposes : [purposes]
  return allowedPurposes.includes(actionToken.purpose as UserActionTokenPurpose)
    ? actionToken
    : null
}

type ActionTokenRecord = NonNullable<Awaited<ReturnType<typeof findUserActionTokenByToken>>>

/**
 * Returns a usable action token matching one of the given purposes, or null
 * when it is unknown, of the wrong purpose, already used, or expired.
 */
export async function findValidActionToken(
  token: string,
  purposes: UserActionTokenPurpose | UserActionTokenPurpose[],
): Promise<ActionTokenRecord | null> {
  const actionToken = await findUserActionTokenByToken(token, purposes)
  if (!actionToken || actionToken.usedAt !== null || hasExpired(actionToken.expiresAt)) {
    return null
  }
  return actionToken
}

/**
 * Consumes an action token inside a transaction: marks it used and deletes any
 * other pending token for the same user and purpose. Pass the transaction
 * client from `prisma.$transaction(async (tx) => ...)` so consumption is atomic
 * with the mutation the token authorizes.
 */
export async function consumeActionToken(
  tx: Prisma.TransactionClient,
  actionToken: ActionTokenRecord,
) {
  await tx.userActionToken.update({
    where: { id: actionToken.id },
    data: { usedAt: new Date() },
  })
  await tx.userActionToken.deleteMany({
    where: {
      userId: actionToken.userId,
      purpose: actionToken.purpose,
      usedAt: null,
      id: { not: actionToken.id },
    },
  })
}

async function createUserActionToken({
  userId,
  purpose,
  targetEmail = null,
}: {
  userId: string
  purpose: UserActionTokenPurpose
  targetEmail?: string | null
}): Promise<string> {
  const token = generateToken()
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS)

  await prisma.$transaction([
    prisma.userActionToken.deleteMany({
      where: {
        userId,
        purpose,
        usedAt: null,
      },
    }),
    prisma.userActionToken.create({
      data: {
        userId,
        purpose,
        targetEmail,
        tokenHash,
        expiresAt,
      },
    }),
  ])

  return token
}

export async function createPasswordResetTokenForUser(userId: string): Promise<string> {
  const token = await createUserActionToken({
    userId,
    purpose: userActionTokenPurpose.passwordReset,
  })

  return token
}

export async function createEmailChangeToken(userId: string, targetEmail: string): Promise<string> {
  return createUserActionToken({
    userId,
    purpose: userActionTokenPurpose.emailChange,
    targetEmail,
  })
}

export async function createEmailVerificationToken(userId: string, targetEmail: string): Promise<string> {
  return createUserActionToken({
    userId,
    purpose: userActionTokenPurpose.emailVerification,
    targetEmail,
  })
}

export async function createUnsubscribeToken(userId: string): Promise<string> {
  return createUserActionToken({
    userId,
    purpose: userActionTokenPurpose.unsubscribe,
  })
}

/**
 * Validates and consumes a purpose-bound action token on behalf of a backend
 * service (e.g. social redeeming an unsubscribe token). The token is marked as
 * used (single-use). Returns the token owner, or null when the token is
 * unknown, of the wrong purpose, already used, or expired.
 */
export async function redeemActionToken(
  token: string,
  purpose: UserActionTokenPurpose,
): Promise<{ userId: string; email: string; purpose: UserActionTokenPurpose } | null> {
  const actionToken = await findValidActionToken(token, purpose)
  if (!actionToken) {
    return null
  }

  const user = await prisma.user.findUnique({
    where: { id: actionToken.userId },
    select: { id: true, email: true },
  })
  if (!user) {
    return null
  }

  await prisma.$transaction((tx) => consumeActionToken(tx, actionToken))

  return { userId: user.id, email: user.email, purpose: actionToken.purpose as UserActionTokenPurpose }
}
