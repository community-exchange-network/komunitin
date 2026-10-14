import type { AccountClaims, ClaimsParameterMember, FindAccount } from 'oidc-provider'
import { config } from '../config'
import prisma from '../utils/prisma'
import bcrypt from 'bcrypt'
import { hashPassword, isLegacyPasswordHash, verifyPassword } from '../services/passwords'
import { normalizeEmail } from '../utils/email'
import { UserStatus } from '../users/status'
import { SUPERADMIN_SCOPE } from './clients'

export const findAccount: FindAccount = async (ctx, id, token) => {
  const user = await prisma.user.findUnique({
    where: { 
      id,
      status: UserStatus.Active,
    },
  })

  if (!user) return undefined

  // oidc-provider calls findAccount during refresh; reject sessions whose superadmin identity is no longer configured.
  if (token && 'scopes' in token && token.scopes.has(SUPERADMIN_SCOPE) && user.email !== config.ADMIN_EMAIL) {
    return undefined
  }

  return {
    accountId: user.id,
    async claims(
      use,
      scope = '',
      requestedClaims: { [key: string]: null | ClaimsParameterMember },
      rejected: string[],
    ) {
      void use
      void requestedClaims
      void rejected

      const scopeSet = new Set(scope.split(' ').filter(Boolean))
      const claims: AccountClaims = {
        sub: user.id,
      }

      if (scopeSet.has('email')) {
        claims.email = user.email
        claims.email_verified = user.emailVerified
      }

      return claims
    },
  }
}

const DUMMY_HASH = '$2b$10$Ep32/O81Gk6z.jBOM7Cg.eo1G2aE8i6E7U8g1xM.sHTXv8K7d8.b6'

export async function authenticate(email: string, passwordSecret: string) {
  const user = await prisma.user.findUnique({
    where: { 
      email: normalizeEmail(email),
      status: UserStatus.Active,
      emailVerified: true,
    },
  })

  if (!user) {
    // Prevent timing attacks by hashing against a dummy string
    await bcrypt.compare(passwordSecret, DUMMY_HASH)
    return null
  }

  const isValid = await verifyPassword(passwordSecret, user.passwordHash)
  if (!isValid) return null

  if (isLegacyPasswordHash(user.passwordHash)) {
    const passwordHash = await hashPassword(passwordSecret)
    // Do not overwrite a password reset or another login's concurrent upgrade.
    await prisma.user.updateMany({
      where: { id: user.id, passwordHash: user.passwordHash },
      data: { passwordHash },
    })
  }

  return user
}
