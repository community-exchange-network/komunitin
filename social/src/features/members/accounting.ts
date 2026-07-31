import { type Account, createAccountingClient } from '../../clients/accounting'
import type { AuthContext } from '../../server/context'

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
 */
export const syncAccountStatus = async (
  ctx: AuthContext,
  member: AccountSyncInput,
  currencyCode: string,
  status: Account['status'],
): Promise<Account> => {
  const accounting = createAccountingClient(ctx)
  let account = await findAccount(accounting, member, currencyCode)

  if (!account) {
    account = await accounting.createAccount(currencyCode, {
      code: member.code,
    }, member.userIds)
  }

  if (account.status !== status) {
    account = await accounting.updateAccount(currencyCode, account.id, { status })
  }

  return account
}
