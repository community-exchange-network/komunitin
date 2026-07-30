import { ErrorCollector } from './errors'
import type { Located, ParsedMigrationRows } from './schemas'

const addFieldError = (
  errors: ErrorCollector,
  code: string,
  message: string,
  file: string,
  row: number,
  column: string,
): void => errors.field(code, message, file, row, column)

const uniqueMap = <T>(
  rows: Located<T>[],
  key: (value: T) => string,
  file: string,
  column: string,
  errors: ErrorCollector,
): Map<string, Located<T>> => {
  const values = new Map<string, Located<T>>()
  for (const row of rows) {
    const sourceKey = key(row.value)
    if (values.has(sourceKey)) {
      addFieldError(errors, 'DUPLICATE_VALUE', `Duplicate ${column}: ${sourceKey}`, file, row.row, column)
    } else {
      values.set(sourceKey, row)
    }
  }
  return values
}

export const validateMigrationSemantics = (rows: ParsedMigrationRows, errors: ErrorCollector): void => {
  if (rows.community === null) return
  const community = rows.community.value
  const users = uniqueMap(rows.users, (user) => user.email, 'users.csv', 'email', errors)
  const members = uniqueMap(rows.members, (member) => member.code, 'members.csv', 'code', errors)
  uniqueMap(
    rows.transfers, (transfer) => transfer.sourceKey, 'transfers.csv', 'sourceKey', errors,
  )
  const categories = uniqueMap(rows.categories, (category) => category.code, 'categories.csv', 'code', errors)
  uniqueMap(rows.posts, (post) => post.code, 'posts.csv', 'code', errors)

  const requireUser = (email: string, file: string, row: number, column: string): boolean => {
    if (users.has(email)) return true
    addFieldError(errors, 'MISSING_REFERENCE', `User ${email} is not present in users.csv`, file, row, column)
    return false
  }

  for (const email of community.adminUsers) {
    requireUser(email, 'community.csv', rows.community.row, 'adminUsers')
  }
  requireUser(community.currency.adminUser, 'community.csv', rows.community.row, 'currency.adminUser')

  for (const memberRow of rows.members) {
    const member = memberRow.value
    if (!member.code.startsWith(community.code)) {
      addFieldError(
        errors,
        'INVALID_MEMBER_CODE',
        `Member code must start with community code ${community.code}`,
        'members.csv',
        memberRow.row,
        'code',
      )
    }
    for (const email of member.adminUsers) {
      requireUser(email, 'members.csv', memberRow.row, 'adminUsers')
    }
  }

  const activeMembershipAdmins = new Set(
    rows.members
      .filter(({ value }) => value.status !== 'deleted')
      .flatMap(({ value }) => value.adminUsers),
  )
  for (const email of community.adminUsers) {
    if (!activeMembershipAdmins.has(email)) {
      addFieldError(
        errors,
        'ADMIN_NOT_MEMBER',
        `Community administrator ${email} must administer a non-deleted member`,
        'community.csv',
        rows.community.row,
        'adminUsers',
      )
    }
  }

  const accounts = new Map(
    rows.members
      .filter((row) => row.value.account !== null)
      .map((row) => [row.value.code, row] as const),
  )
  const requireAccount = (code: string, file: string, row: number, column: string): boolean => {
    if (accounts.has(code)) return true
    addFieldError(
      errors,
      'MISSING_ACCOUNT_REFERENCE',
      `Accounting account ${code} is not present in this bundle`,
      file,
      row,
      column,
    )
    return false
  }

  for (const code of community.currency.settings.defaultAcceptPaymentsWhitelist) {
    requireAccount(code, 'community.csv', rows.community.row, 'currency.settings.defaultAcceptPaymentsWhitelist')
  }
  for (const memberRow of rows.members) {
    for (const code of memberRow.value.account?.settings.acceptPaymentsWhitelist ?? []) {
      requireAccount(code, 'members.csv', memberRow.row, 'account.settings.acceptPaymentsWhitelist')
    }
  }

  const calculatedBalances = new Map([...accounts.keys()].map((code) => [code, 0n]))
  for (const transferRow of rows.transfers) {
    const transfer = transferRow.value
    requireUser(transfer.initiatorUser, 'transfers.csv', transferRow.row, 'initiatorUser')
    const payerExists = requireAccount(
      transfer.payerAccountCode, 'transfers.csv', transferRow.row, 'payerAccountCode',
    )
    const payeeExists = requireAccount(
      transfer.payeeAccountCode, 'transfers.csv', transferRow.row, 'payeeAccountCode',
    )
    if (transfer.payerAccountCode === transfer.payeeAccountCode) {
      addFieldError(
        errors,
        'SELF_TRANSFER',
        'Payer and payee accounts must be distinct',
        'transfers.csv',
        transferRow.row,
        'payeeAccountCode',
      )
    }

    if (payerExists && payeeExists && transfer.payerAccountCode !== transfer.payeeAccountCode) {
      const amount = BigInt(transfer.amount)
      calculatedBalances.set(
        transfer.payerAccountCode,
        calculatedBalances.get(transfer.payerAccountCode)! - amount,
      )
      calculatedBalances.set(
        transfer.payeeAccountCode,
        calculatedBalances.get(transfer.payeeAccountCode)! + amount,
      )
    }
  }

  for (const postRow of rows.posts) {
    const post = postRow.value
    const owner = members.get(post.memberCode)
    if (!owner) {
      addFieldError(
        errors,
        'MISSING_REFERENCE',
        `Member ${post.memberCode} is not present in members.csv`,
        'posts.csv',
        postRow.row,
        'memberCode',
      )
    } else if (post.status === 'published' && owner.value.status !== 'active') {
      addFieldError(
        errors,
        'INACTIVE_POST_OWNER',
        'Published posts must belong to an active member',
        'posts.csv',
        postRow.row,
        'memberCode',
      )
    }
    if (post.categoryCode !== null && !categories.has(post.categoryCode)) {
      addFieldError(
        errors,
        'MISSING_REFERENCE',
        `Category ${post.categoryCode} is not present in categories.csv`,
        'posts.csv',
        postRow.row,
        'categoryCode',
      )
    }
  }

  let declaredTotal = 0n
  for (const memberRow of accounts.values()) {
    const account = memberRow.value.account!
    const declared = BigInt(account.balance)
    declaredTotal += declared
    const calculated = calculatedBalances.get(account.code)!
    if (declared !== calculated) {
      addFieldError(
        errors,
        'BALANCE_MISMATCH',
        `Declared scaled balance ${declared} does not match transfer history balance ${calculated}`,
        'members.csv',
        memberRow.row,
        'account.balance',
      )
    }
  }
  if (declaredTotal !== 0n) {
    errors.add({
      code: 'NON_ZERO_TOTAL_BALANCE',
      message: `Total declared scaled account balance must be zero; got ${declaredTotal}`,
      file: 'members.csv',
      row: null,
      column: 'account.balance',
    })
  }
}
