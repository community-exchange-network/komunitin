import bcrypt from 'bcrypt'
import crypto from 'node:crypto'
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

export async function findPasswordResetByToken(token: string) {
  return findUserActionTokenByToken(token, userActionTokenPurpose.passwordReset)
}

export async function findEmailActionByToken(token: string) {
  return findUserActionTokenByToken(token, [
    userActionTokenPurpose.emailChange,
    userActionTokenPurpose.emailVerification,
  ])
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
