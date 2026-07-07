import type { AccountClaims, ClaimsParameterMember, FindAccount } from 'oidc-provider'
import prisma from '../utils/prisma'
import bcrypt from 'bcrypt'

export const findAccount: FindAccount = async (ctx, id) => {
  const user = await prisma.user.findUnique({
    where: { id },
  })

  if (!user) return undefined

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
    where: { email },
  })

  if (!user) {
    // Prevent timing attacks by hashing against a dummy string
    await bcrypt.compare(passwordSecret, DUMMY_HASH)
    return null
  }

  const isValid = await bcrypt.compare(passwordSecret, user.passwordHash)
  if (!isValid) return null

  if (user.status !== 'active') {
    throw new Error('User account is not active')
  }

  return user
}
