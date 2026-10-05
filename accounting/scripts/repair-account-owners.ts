import 'dotenv/config'
import { readFile } from 'node:fs/promises'
import { parseArgs } from 'node:util'
import { validate as isUuid } from 'uuid'
import { PrismaClient } from '@prisma/client'
import { tenantDb } from '../src/controller/multitenant'

interface OwnerRepair {
  code: string
  accountId: string
  previousUserIds: string[]
  userIds: string[]
}

const sameIds = (a: string[], b: string[]) => a.length === b.length && a.every(id => b.includes(id))
const validIds = (ids: unknown): ids is string[] => Array.isArray(ids)
  && ids.every(id => typeof id === 'string' && isUuid(id)) && new Set(ids).size === ids.length

/** Apply reviewed identity-link repairs only; never change ledger data or balances. */
async function main() {
  const { values } = parseArgs({ options: { input: { type: 'string' }, apply: { type: 'boolean' } } })
  if (!values.input) throw new Error('Usage: pnpm exec tsx scripts/repair-account-owners.ts --input <repairs.json> [--apply]')
  const repairs: OwnerRepair[] = JSON.parse(await readFile(values.input, 'utf8'))
  if (!Array.isArray(repairs) || repairs.some(repair => typeof repair.code !== 'string'
    || !/^[A-Z0-9]{4}.+$/.test(repair.code) || !isUuid(repair.accountId)
    || !validIds(repair.previousUserIds) || !validIds(repair.userIds) || !repair.userIds.length)
    || new Set(repairs.map(repair => repair.accountId)).size !== repairs.length) {
    throw new Error('Expected unique account repairs with code, accountId, previousUserIds and nonempty userIds')
  }
  const prisma = new PrismaClient()
  try {
    for (const repair of repairs) {
      const db = tenantDb(prisma, repair.code.slice(0, 4))
      await db.transaction(async tx => {
        // Lock the account while checking the reviewed precondition and replacing its links.
        await tx.$queryRaw`SELECT id FROM "Account" WHERE id = ${repair.accountId} FOR UPDATE`
        const account = await tx.account.findUniqueOrThrow({ where: { id: repair.accountId }, include: { users: true } })
        if (account.code !== repair.code) throw new Error(`Account code/UUID mismatch: ${repair.code}`)
        const current = account.users.map(user => user.userId)
        if (sameIds(current, repair.userIds)) {
          console.log(`${repair.code}: already reconciled`)
        } else {
          if (!sameIds(current, repair.previousUserIds)) throw new Error(`Owners changed since review: ${repair.code}`)
          console.log(`${values.apply ? 'APPLY' : 'DRY RUN'} ${repair.code}: ${current.join(',')} -> ${repair.userIds.join(',')}`)
          if (values.apply) {
            for (const id of repair.userIds) {
              await tx.user.upsert({ where: { tenantId_id: { tenantId: db.tenantId, id } }, create: { tenantId: db.tenantId, id }, update: {} })
            }
            await tx.accountUser.deleteMany({ where: { accountId: account.id } })
            await tx.accountUser.createMany({ data: repair.userIds.map(userId => ({ tenantId: db.tenantId, accountId: account.id, userId })) })
          }
        }
      })
    }
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Account owner repair failed')
  process.exitCode = 1
})
