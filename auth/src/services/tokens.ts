import { hashPassword as createPasswordHash } from './passwords'
import crypto from 'node:crypto'
import type { Prisma } from '../generated/prisma/client'
import prisma from '../utils/prisma'
import { badRequest } from '../utils/error'
import type { SignupContext } from '../users/signup'

const DAY_MS = 24 * 60 * 60 * 1000

export const userActionTokenPurpose = {
  passwordReset: 'passwordReset',
  emailChange: 'emailChange',
  emailVerification: 'emailVerification',
  unsubscribe: 'unsubscribe',
  memberDeletion: 'memberDeletion',
} as const

export type UserActionTokenPurpose =
  (typeof userActionTokenPurpose)[keyof typeof userActionTokenPurpose]

const defaultPolicy = {
  ttlMs: DAY_MS,
  replacePending: true,
} as const

const actionTokenPolicies = {
  [userActionTokenPurpose.passwordReset]: defaultPolicy,
  [userActionTokenPurpose.emailChange]: defaultPolicy,
  [userActionTokenPurpose.emailVerification]: defaultPolicy,
  [userActionTokenPurpose.memberDeletion]: defaultPolicy,
  [userActionTokenPurpose.unsubscribe]: {
    ttlMs: 365 * DAY_MS,
    replacePending: false,
  },
} satisfies Record<UserActionTokenPurpose, {
  ttlMs: number
  replacePending: boolean
}>

export async function hashPassword(password: string): Promise<string> {
  if (password.length < 8) {
    throw badRequest('Password must be at least 8 characters long')
  }
  return createPasswordHash(password)
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

/**
 * Returns an action token matching one of the given purposes, regardless of
 * whether it has been used or expired.
 */
export async function findActionToken(
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

type ActionTokenRecord = NonNullable<Awaited<ReturnType<typeof findActionToken>>>

/**
 * Returns a usable action token matching one of the given purposes, or null
 * when it is unknown, of the wrong purpose, already used, or expired.
 */
export async function findValidActionToken(
  token: string,
  purposes: UserActionTokenPurpose | UserActionTokenPurpose[],
): Promise<ActionTokenRecord | null> {
  const actionToken = await findActionToken(token, purposes)
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
    where: { id: actionToken.id, usedAt: null },
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
  data,
}: {
  userId: string
  purpose: UserActionTokenPurpose
  targetEmail?: string | null
  data?: SignupContext | string
}): Promise<string> {
  const token = generateToken()
  const tokenHash = hashToken(token)
  const now = new Date()
  const policy = actionTokenPolicies[purpose]
  const expiresAt = new Date(now.getTime() + policy.ttlMs)

  await prisma.$transaction([
    prisma.userActionToken.deleteMany({
      where: {
        userId,
        purpose,
        OR: [
          { expiresAt: { lte: now } },
          ...(policy.replacePending ? [{ usedAt: null }] : []),
        ],
      },
    }),
    prisma.userActionToken.create({
      data: {
        userId,
        purpose,
        targetEmail,
        data,
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

export async function createEmailVerificationToken(
  userId: string,
  targetEmail: string,
  signup?: SignupContext,
): Promise<string> {
  return createUserActionToken({
    userId,
    purpose: userActionTokenPurpose.emailVerification,
    targetEmail,
    data: signup,
  })
}

export async function createUnsubscribeToken(userId: string): Promise<string> {
  return createUserActionToken({
    userId,
    purpose: userActionTokenPurpose.unsubscribe,
  })
}

export async function createMemberDeletionToken(
  userId: string,
  memberId: string,
) {
  return createUserActionToken({
    userId,
    purpose: userActionTokenPurpose.memberDeletion,
    data: memberId,
  })
}

/**
 * Resolves a purpose-bound action token on behalf of a backend service.
 * Tokens remain replayable so Social can retry its mutation after resolution.
 */
export async function redeemActionToken(
  token: string,
  purpose: typeof userActionTokenPurpose.unsubscribe | typeof userActionTokenPurpose.memberDeletion,
) {
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

  return {
    userId: user.id,
    email: user.email,
    purpose,
    data: actionToken.data,
  }
}
