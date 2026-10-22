import { z } from 'zod'
import { config } from '../../config'
import { getSocialServiceToken } from '../../clients/auth'
import { Scope } from '../../server/scopes'
import type { AccountingFiles, MigrationImportPlan } from './bundle'
import {
  MigrationConflict,
  type AccountingReference,
  type AccountingReferences,
  type IdentifiedMigrationPlan,
  type MigrationLog,
} from './types'

const relationship = z.object({ data: z.array(z.object({ id: z.uuid() })) })
const resourceFields = {
  id: z.uuid(),
  attributes: z.object({ code: z.string(), status: z.string() }),
  links: z.object({ self: z.url() }),
}
const currencySchema = z.object({
  ...resourceFields,
  type: z.literal('currencies'),
  relationships: z.object({ admins: relationship.optional() }),
}).transform(currency => ({
  id: currency.id,
  href: currency.links.self,
  code: currency.attributes.code,
  admins: currency.relationships.admins?.data.map(admin => admin.id) ?? [],
}))
const accountSchema = z.object({
  ...resourceFields,
  type: z.literal('accounts'),
  relationships: z.object({ users: relationship }),
}).transform(account => ({
  id: account.id,
  href: account.links.self,
  code: account.attributes.code,
  status: account.attributes.status,
  users: account.relationships.users.data.map(user => user.id),
}))

interface AccountingSnapshot {
  currency: z.infer<typeof currencySchema> | null
  accounts: Map<string, z.infer<typeof accountSchema>>
}

const membersWithAccounts = (plan: MigrationImportPlan) => {
  const owners = Map.groupBy(plan.memberUsers, row => row.member)
  return plan.members
    .filter(member => member.status !== 'draft' && member.status !== 'pending')
    .map(member => ({
      code: member.code,
      accountId: member.accountId,
      status: member.status,
      users: (owners.get(member.code) ?? []).map(row => row.user),
    }))
}

const readAccounting = async (path: string) => {
  const response = await fetch(new URL(path, config.ACCOUNTING_URL), {
    headers: {
      Authorization: `Bearer ${await getSocialServiceToken()}`,
      Accept: 'application/vnd.api+json',
    },
    signal: AbortSignal.timeout(30_000),
  })
  if (response.status === 404) return null
  if (!response.ok) throw new MigrationConflict(`Accounting GET ${path}: HTTP ${response.status}`)
  return await response.json() as { data: unknown }
}

/** Load existing records by code, reusing the snapshot when completing a partial import. */
export const loadAccounting = async (
  plan: MigrationImportPlan,
  previous?: AccountingSnapshot,
): Promise<AccountingSnapshot> => {
  const { code, currencyId } = plan.community
  let currency = previous?.currency ?? null
  const accounts = new Map(previous?.accounts)

  if (!currency) {
    const response = await readAccounting(`/${code}/currency`)
    currency = response ? currencySchema.parse(response.data) : null
  }
  if (currency) {
    if (currency.code !== code || (currencyId && currency.id !== currencyId)) {
      throw new MigrationConflict(`Currency ${code}: code or supplied UUID does not match accounting`)
    }
    for (const member of membersWithAccounts(plan)) {
      if (accounts.has(member.code)) continue

      const path = `/${code}/accounts?filter[code]=${encodeURIComponent(member.code)}`
      const response = await readAccounting(path)
      if (!response) throw new MigrationConflict(`Accounting GET ${path}: HTTP 404`)
      const matches = z.array(accountSchema).parse(response.data)
      if (!matches.length) continue

      const account = matches[0]
      if (matches.length !== 1 || account.code !== member.code
        || (member.accountId && account.id !== member.accountId)) {
        throw new MigrationConflict(`Account ${member.code}: ambiguous or supplied UUID conflicts with accounting`)
      }
      accounts.set(member.code, account)
    }
  }
  return { currency, accounts }
}

const verifyOwners = (plan: MigrationImportPlan, snapshot: AccountingSnapshot) => {
  const userIds = new Map(plan.users.map(user => [user.email, user.id]))
  for (const member of membersWithAccounts(plan)) {
    const account = snapshot.accounts.get(member.code)
    if (!account) continue

    for (const email of member.users) {
      const id = userIds.get(email)
      if (!id || !account.users.includes(id)) {
        throw new MigrationConflict(`Account ${member.code}: user ${email} cannot be matched to an existing accounting owner; supply the canonical user UUID`)
      }
    }
  }
  const admin = plan.community.currencyAdmin
  if (snapshot.currency && admin && !snapshot.currency.admins.includes(userIds.get(admin)!)) {
    throw new MigrationConflict(`Currency ${plan.community.code}: administrator ${admin} does not match accounting`)
  }
}

/** Infer only unambiguous identities before Auth creates any users. */
export const resolveAccountingIdentities = (plan: MigrationImportPlan, snapshot: AccountingSnapshot) => {
  const users = new Map(plan.users.map(user => [user.email, user]))
  const assignIdentity = (email: string, id: string) => {
    const user = users.get(email)!
    if (user.id && user.id !== id) {
      throw new MigrationConflict(`User ${email}: UUID ${user.id} conflicts with accounting owner ${id}`)
    }
    user.id = id
  }

  const admin = plan.community.currencyAdmin
  const adminIds = snapshot.currency?.admins ?? []
  if (admin && adminIds.length === 1) assignIdentity(admin, adminIds[0])

  for (const member of membersWithAccounts(plan)) {
    const account = snapshot.accounts.get(member.code)
    if (account?.users.length === 1 && member.users.length === 1) {
      assignIdentity(member.users[0], account.users[0])
    }
  }
  // A shared user's other membership may supply their UUID, so verify after all inference.
  verifyOwners(plan, snapshot)
}

/** Fetch only newly created records and return the complete links needed by Social. */
export const resolveAccountingReferences = async (
  plan: IdentifiedMigrationPlan,
  previous: AccountingSnapshot,
  log: MigrationLog,
): Promise<AccountingReferences> => {
  const snapshot = await loadAccounting(plan, previous)
  if (!snapshot.currency) throw new MigrationConflict('Accounting did not create the currency')
  verifyOwners(plan, snapshot)

  const accounts = new Map<string, AccountingReference>()
  for (const member of membersWithAccounts(plan)) {
    const account = snapshot.accounts.get(member.code)
    if (!account) throw new MigrationConflict(`Accounting did not create account ${member.code}`)

    accounts.set(member.code, { id: account.id, href: account.href })
    if (account.status !== member.status) {
      await log('warn', 'accounting', `Member ${member.code}: source status ${member.status} differs from accounting ${account.status}; preserving both`)
    }
    if (account.users.length > member.users.length) {
      await log('warn', 'accounting', `Account ${member.code}: accounting has additional owners absent from the bundle; preserved`)
    }
  }
  await log('info', 'accounting', 'Currency and account references verified', { accounts: accounts.size })
  return {
    currency: { id: snapshot.currency.id, href: snapshot.currency.href },
    accounts,
  }
}

const migrationLogEntry = z.object({
  level: z.enum(['info', 'warn', 'error']),
  step: z.string(),
  message: z.string(),
})
const migrationEnd = z.object({ status: z.enum(['completed', 'failed']) })

const consumeProgress = async (
  body: AsyncIterable<Uint8Array>,
  log: MigrationLog,
  assertActive: () => void,
) => {
  const decoder = new TextDecoder()
  let buffer = ''
  let status: z.infer<typeof migrationEnd>['status'] | undefined

  for await (const chunk of body) {
    assertActive()
    // Preserve split UTF-8 characters and incomplete events between network chunks.
    buffer += decoder.decode(chunk, { stream: true })
    let boundary: number
    while ((boundary = buffer.indexOf('\n\n')) !== -1) {
      const lines = buffer.slice(0, boundary).split('\n')
      buffer = buffer.slice(boundary + 2)
      const data = lines.find(line => line.startsWith('data: '))?.slice(6)
      if (!data) continue // Heartbeats carry no data.

      if (lines.includes('event: end')) {
        status = migrationEnd.parse(JSON.parse(data)).status
      } else if (lines.includes('event: progress')) {
        const entry = migrationLogEntry.parse(JSON.parse(data))
        await log(entry.level, `accounting:${entry.step}`, entry.message)
      }
    }
  }
  return status
}

/** Accounting owns execution and checkpoints; Social persists its streamed progress. */
export const importAccounting = async (
  plan: IdentifiedMigrationPlan,
  files: AccountingFiles,
  log: MigrationLog,
  assertActive: () => void,
) => {
  const members = membersWithAccounts(plan).map(({ code, status, users }) => ({ code, status, users }))
  const users = plan.users.map(({ id, email }) => ({ id, email }))
  assertActive()

  // Imports may take hours. Accounting heartbeats keep the response open without a total timeout.
  const response = await fetch(new URL('/migrations', config.ACCOUNTING_URL), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${await getSocialServiceToken(false, Scope.AccountingWrite)}`,
      'Content-Type': 'application/vnd.komunitin.migration+json',
      Accept: 'text/event-stream',
    },
    body: JSON.stringify({ files, users, members }),
  })
  if (!response.ok) {
    const result = await response.json() as { errors?: { detail?: string }[] }
    throw new MigrationConflict(`Accounting import: ${result.errors?.[0]?.detail ?? `HTTP ${response.status}`}`)
  }

  const id = z.uuid().parse(response.headers.get('X-Migration-Id'))
  await log('info', 'accounting', 'Accounting migration accepted', { accountingMigrationId: id })
  if (!response.body) throw new MigrationConflict('Accounting migration progress stream is missing')
  const status = await consumeProgress(response.body, log, assertActive)
  if (status === 'failed') {
    throw new MigrationConflict(`Accounting migration ${id} failed; correct the reported cause and re-upload`)
  }
  if (!status) {
    throw new MigrationConflict(`Accounting migration ${id} progress stream ended before completion; re-upload to resume`)
  }
}
