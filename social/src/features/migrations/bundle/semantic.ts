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
  key: (value: T) => string | null,
  file: string,
  column: string,
  errors: ErrorCollector,
): Map<string, Located<T>> => {
  const values = new Map<string, Located<T>>()
  for (const row of rows) {
    const sourceKey = key(row.value)
    if (sourceKey === null) continue
    if (values.has(sourceKey)) {
      addFieldError(errors, 'DUPLICATE_VALUE', `Duplicate ${column}: ${sourceKey}`, file, row.row, column)
    } else {
      values.set(sourceKey, row)
    }
  }
  return values
}

export const validateMigrationSemantics = (rows: ParsedMigrationRows, errors: ErrorCollector): void => {
  if (rows.community === null || rows.currency === null) return
  const community = rows.community.value
  const currency = rows.currency.value
  const users = uniqueMap(rows.users, (user) => user.email, 'users.csv', 'email', errors)
  const members = uniqueMap(rows.members, (member) => member.code, 'members.csv', 'code', errors)
  const accounts = uniqueMap(rows.accounts, (account) => account.code, 'accounts.csv', 'code', errors)
  uniqueMap(
    rows.transfers, (transfer) => transfer.id, 'transfers.csv', 'id', errors,
  )
  const categories = uniqueMap(rows.categories, (category) => category.code, 'categories.csv', 'code', errors)
  uniqueMap(rows.posts, (post) => post.code, 'posts.csv', 'code', errors)

  uniqueMap(rows.users, (user) => user.id, 'users.csv', 'id', errors)
  uniqueMap(rows.memberUsers, (relation) => relation.id, 'member-users.csv', 'id', errors)
  uniqueMap(rows.members, (member) => member.id, 'members.csv', 'id', errors)
  uniqueMap(rows.accounts, (account) => account.id, 'accounts.csv', 'id', errors)
  uniqueMap(rows.categories, (category) => category.id, 'categories.csv', 'id', errors)
  uniqueMap(rows.posts, (post) => post.id, 'posts.csv', 'id', errors)

  const requireUser = (email: string, file: string, row: number, column: string): boolean => {
    if (users.has(email)) return true
    addFieldError(errors, 'MISSING_REFERENCE', `User ${email} is not present in users.csv`, file, row, column)
    return false
  }

  for (const email of community.adminUsers) {
    requireUser(email, 'community.csv', rows.community.row, 'adminUsers')
  }
  if (currency.code !== community.code) {
    addFieldError(errors, 'CURRENCY_CODE_MISMATCH',
      'Currency code must match the community code', 'currency.csv', rows.currency.row, 'code')
  }
  if (currency.data?.adminUser != null) {
    requireUser(currency.data.adminUser, 'currency.csv', rows.currency.row, 'adminUser')
    if (!community.adminUsers.includes(currency.data.adminUser)) {
      addFieldError(errors, 'INVALID_CURRENCY_ADMIN',
        'Currency administrator must also be a community administrator', 'currency.csv', rows.currency.row, 'adminUser')
    }
  }

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
  }

  const memberUsers = uniqueMap(
    rows.memberUsers,
    (relation) => JSON.stringify([relation.member, relation.user]),
    'member-users.csv',
    'user',
    errors,
  )
  const membersWithUsers = new Set<string>()
  for (const { value: relation, row } of memberUsers.values()) {
    requireUser(relation.user, 'member-users.csv', row, 'user')
    const member = members.get(relation.member)
    if (!member) {
      addFieldError(errors, 'MISSING_REFERENCE',
        `Member ${relation.member} is not present in members.csv`, 'member-users.csv', row, 'member')
    } else {
      membersWithUsers.add(relation.member)
    }
  }
  for (const { value: member, row } of rows.members) {
    if (member.status !== 'deleted' && !membersWithUsers.has(member.code)) {
      addFieldError(errors, 'MISSING_MEMBER_USER',
        'Every non-deleted member must have a member-users.csv relationship', 'members.csv', row, 'code')
    }
    if (member.status !== 'draft' && member.status !== 'pending' && !accounts.has(member.code)) {
      addFieldError(errors, 'MISSING_ACCOUNT_REFERENCE',
        `Member ${member.code} requires a matching account in accounts.csv`, 'members.csv', row, 'code')
    }
  }
  for (const { value: account, row } of rows.accounts) {
    const member = members.get(account.code)?.value
    if (!member) {
      addFieldError(errors, 'MISSING_REFERENCE',
        `Account ${account.code} requires a matching member in members.csv`, 'accounts.csv', row, 'code')
    } else if (member.status === 'draft' || member.status === 'pending') {
      addFieldError(errors, 'ACCOUNT_NOT_ALLOWED',
        'Draft and pending members must not have an account row', 'accounts.csv', row, 'code')
    } else if (member.status === 'deleted' && account.data?.balance != null && BigInt(account.data.balance) !== 0n) {
      addFieldError(errors, 'DELETED_ACCOUNT_BALANCE',
        'Deleted member accounts must have a zero balance', 'accounts.csv', row, 'balance')
    }
  }
  const requireAccount = (code: string, file: string, row: number, column: string): boolean => {
    if (accounts.has(code)) return true
    addFieldError(
      errors,
      'MISSING_ACCOUNT_REFERENCE',
      `Account ${code} is not present in this bundle`,
      file,
      row,
      column,
    )
    return false
  }

  for (const code of currency.data?.settings.defaultAcceptPaymentsWhitelist ?? []) {
    requireAccount(code, 'currency.csv', rows.currency.row, 'settings.defaultAcceptPaymentsWhitelist')
  }
  for (const accountRow of rows.accounts) {
    for (const code of accountRow.value.data?.settings.acceptPaymentsWhitelist ?? []) {
      requireAccount(code, 'accounts.csv', accountRow.row, 'settings.acceptPaymentsWhitelist')
    }
  }

  const calculatedBalances = new Map([...accounts.keys()].map((code) => [code, 0n]))
  for (const transferRow of rows.transfers) {
    const transfer = transferRow.value
    requireUser(transfer.user, 'transfers.csv', transferRow.row, 'user')
    const payerExists = requireAccount(
      transfer.payer, 'transfers.csv', transferRow.row, 'payer',
    )
    const payeeExists = requireAccount(
      transfer.payee, 'transfers.csv', transferRow.row, 'payee',
    )
    if (transfer.payer === transfer.payee) {
      addFieldError(
        errors,
        'SELF_TRANSFER',
        'Payer and payee accounts must be distinct',
        'transfers.csv',
        transferRow.row,
        'payee',
      )
    }

    if (payerExists && payeeExists && transfer.payer !== transfer.payee) {
      const amount = BigInt(transfer.amount)
      calculatedBalances.set(
        transfer.payer,
        calculatedBalances.get(transfer.payer)! - amount,
      )
      calculatedBalances.set(
        transfer.payee,
        calculatedBalances.get(transfer.payee)! + amount,
      )
    }
  }

  for (const postRow of rows.posts) {
    const post = postRow.value
    const owner = members.get(post.member)
    if (!owner) {
      addFieldError(
        errors,
        'MISSING_REFERENCE',
        `Member ${post.member} is not present in members.csv`,
        'posts.csv',
        postRow.row,
        'member',
      )
    }
    if (post.category !== null && !categories.has(post.category)) {
      addFieldError(
        errors,
        'MISSING_REFERENCE',
        `Category ${post.category} is not present in categories.csv`,
        'posts.csv',
        postRow.row,
        'category',
      )
    }
  }

  // Partial bundles need remote balances before history can be reconciled.
  if ([...accounts.values()].every(({ value }) => value.data?.balance != null)) {
    let declaredTotal = 0n
    for (const accountRow of accounts.values()) {
      const account = accountRow.value
      const declared = BigInt(account.data!.balance!)
      declaredTotal += declared
      const calculated = calculatedBalances.get(account.code)!
      if (declared !== calculated) {
        addFieldError(
          errors,
          'BALANCE_MISMATCH',
          `Declared scaled balance ${declared} does not match transfer history balance ${calculated}`,
          'accounts.csv',
          accountRow.row,
          'balance',
        )
      }
    }
    if (declaredTotal !== 0n) {
      errors.add({
        code: 'NON_ZERO_TOTAL_BALANCE',
        message: `Total declared scaled account balance must be zero; got ${declaredTotal}`,
        file: 'accounts.csv',
        row: null,
        column: 'balance',
      })
    }
  }
}
