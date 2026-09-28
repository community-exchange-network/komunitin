import { z } from 'zod'
import { config } from '../../config'
import { getSocialServiceToken } from '../../clients/auth'
import type { MigrationImportPlan } from './bundle'
import { MigrationConflict, type MigrationLog } from './types'

const relationship = z.object({ data: z.array(z.object({ id: z.uuid() })) })
const resource = z.object({
  id: z.uuid(),
  type: z.enum(['currencies', 'accounts']),
  attributes: z.object({ code: z.string(), status: z.string() }),
  links: z.object({ self: z.url() }),
  relationships: z.object({ users: relationship.optional(), admins: relationship.optional() }),
})
type AccountingResource = z.infer<typeof resource>

// This migration has no accounting write path and does not depend on the initiating user's token.
const readAccounting = async (path: string) => {
  const response = await fetch(new URL(path, config.ACCOUNTING_URL), {
    headers: { Authorization: `Bearer ${await getSocialServiceToken()}`, Accept: 'application/vnd.api+json' },
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new MigrationConflict(`Accounting GET ${path}: HTTP ${response.status}; existing accounting data is required`)
  return await response.json() as { data: unknown }
}

/** Resolve references by code and require supplied UUIDs and known owner UUIDs to agree. */
export const checkAccounting = async (plan: MigrationImportPlan, log: MigrationLog) => {
  const code = plan.community.code
  const currency = resource.parse((await readAccounting(`/${code}/currency`)).data)
  if (currency.type !== 'currencies' || currency.attributes.code !== code
    || (plan.community.currencyId && currency.id !== plan.community.currencyId)) {
    throw new MigrationConflict(`Currency ${code}: code or supplied UUID does not match accounting`)
  }
  const users = new Map(plan.users.map(user => [user.email, user]))
  const assignIdentity = (email: string, id: string) => {
    const user = users.get(email)!
    if (user.id && user.id !== id) throw new MigrationConflict(`User ${email}: UUID ${user.id} conflicts with accounting owner ${id}`)
    user.id = id
  }
  const currencyAdmin = plan.community.currency?.adminUser
  const adminIds = currency.relationships.admins?.data.map(admin => admin.id) ?? []
  if (currencyAdmin && adminIds.length === 1) assignIdentity(currencyAdmin, adminIds[0])

  const ownersByMember = Map.groupBy(plan.memberUsers, row => row.member)
  const accounts = new Map<string, AccountingResource>()
  for (const member of plan.members) {
    if (member.status === 'draft' || member.status === 'pending') continue
    const memberUsers = (ownersByMember.get(member.code) ?? []).map(row => row.user)
    const path = `/${code}/accounts?filter[code]=${encodeURIComponent(member.code)}`
    const matches = z.array(resource).parse((await readAccounting(path)).data)
    const account = matches[0]
    if (matches.length !== 1 || account.type !== 'accounts' || account.attributes.code !== member.code
      || (member.accountId && account.id !== member.accountId)) {
      throw new MigrationConflict(`Account ${member.code}: missing, ambiguous, or supplied UUID conflicts with accounting`)
    }
    const owners = account.relationships.users?.data
    if (!owners) throw new MigrationConflict(`Account ${member.code}: accounting did not return owner relationships`)
    if (owners.length === 1 && memberUsers.length === 1) assignIdentity(memberUsers[0], owners[0].id)
    accounts.set(member.code, account)
    if (account.attributes.status !== member.status) {
      await log('warn', 'accounting', `Member ${member.code}: source status ${member.status} differs from accounting ${account.attributes.status}; preserving both`)
    }
  }
  // Do this after inference across every membership: a shared user's other account may identify them.
  for (const member of plan.members) {
    if (member.status === 'draft' || member.status === 'pending') continue
    const memberUsers = (ownersByMember.get(member.code) ?? []).map(row => row.user)
    const owners = accounts.get(member.code)!.relationships.users!.data.map(owner => owner.id)
    for (const email of memberUsers) {
      const id = users.get(email)!.id
      if (!id || !owners.includes(id)) {
        throw new MigrationConflict(`Account ${member.code}: user ${email} cannot be matched to an existing accounting owner; supply the canonical user UUID`)
      }
    }
    if (owners.length > memberUsers.length) {
      await log('warn', 'accounting', `Account ${member.code}: accounting has additional owners absent from the bundle; preserved`)
    }
  }
  if (currencyAdmin && !adminIds.includes(users.get(currencyAdmin)!.id!)) {
    throw new MigrationConflict(`Currency ${code}: administrator ${currencyAdmin} does not match accounting`)
  }
  await log('info', 'accounting', 'Existing currency and accounts verified; accounting data is unchanged', { accounts: accounts.size })
  if (plan.transfers.length || plan.community.currency || plan.members.some(member => member.account)) {
    await log('warn', 'accounting', 'Accounting attributes, balances, settings and transfer history in the bundle are not imported or reconciled in this mode')
  }
  return { currency, accounts }
}
