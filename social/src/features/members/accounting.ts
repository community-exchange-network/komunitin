import { type Account, createAccountingClient } from '../../clients/accounting'
import type { AuthContext } from '../../server/context'
import { internalError } from '../../utils/error'

type AccountSyncInput = {
  accountId?: string | null
  code: string
  userIds: string[]
}

type AccountingClient = ReturnType<typeof createAccountingClient>

const findAccount = async (
  accounting: AccountingClient,
  member: AccountSyncInput,
  currencyCode: string,
): Promise<Account | undefined> => {
  if (member.accountId) {
    return accounting.getAccount(currencyCode, member.accountId)
  }

  // Adopt an account left by a previously interrupted cross-service operation.
  return accounting.findAccountByCode(currencyCode, member.code)
}

/**
 * Create or update the Accounting account corresponding to a Social member.
 *
 * This operation is idempotent so callers can retry a cross-service transition.
 * It adopts an account created by an interrupted attempt and skips an update when
 * Accounting already has the requested status. The Social member must only be
 * updated after this function succeeds. A source status limits recovery to existing
 * accounts in that state, preserving independent Accounting restrictions.
 */
export const syncAccountStatus = async (
  ctx: AuthContext,
  member: AccountSyncInput,
  currencyCode: string,
  status: Account['status'],
  fromStatus?: Account['status'],
): Promise<Account> => {
  const accounting = createAccountingClient(ctx)
  let account = await findAccount(accounting, member, currencyCode)

  if (!account) {
    if (fromStatus) {
      throw internalError('Cannot recover a missing Accounting account')
    }
    account = await accounting.createAccount(currencyCode, {
      code: member.code,
    }, member.userIds)
  }

  if (account.status !== status && (fromStatus === undefined || account.status === fromStatus)) {
    account = await accounting.updateAccount(currencyCode, account.id, { status })
  }

  return account
}
