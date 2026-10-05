import assert from 'node:assert/strict'
import { parseArgs } from 'node:util'
import { createConnection, type RowDataPacket } from 'mysql2/promise'
import { apiUrl, requiredEnv } from '../../utils.ts'

interface Account extends RowDataPacket {
  id: number
  name: string
  uuid: string
  state: number
  kind: number
  balance: string
  exchangeCode: string
  exchangeState: number
}

interface Owner extends RowDataPacket {
  id: number
  user: number
  account: number
  privilege: number
}

/** Repair the two reviewed ICES source inconsistencies without changing identity or ledger data. */
export const repairIcesSource = async (args: string[]) => {
  const { values } = parseArgs({ args, options: {
    apply: { type: 'boolean', default: false }, help: { type: 'boolean', default: false },
  } })
  if (values.help) {
    console.log('Usage: komunitin admin repair ices [--apply]\nUses ICES_DATABASE_URL, exactly as admin bundle ices. Defaults to a preview.')
  } else {
    console.log('COOP2369 Accounting absence was verified in the reviewed snapshot only; this command checks ICES, not live Accounting.')
    const db = await createConnection(apiUrl(requiredEnv('ICES_DATABASE_URL'))).catch(error => {
      throw new Error(`Could not connect to the ICES database (${error.code ?? 'connection failed'})`)
    })
    try {
      const [tables] = await db.query<RowDataPacket[]>(`SELECT TABLE_NAME, ENGINE FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('ces_account', 'ces_accountuser', 'ces_transaction')`)
      assert(tables.length === 3 && tables.every(table => table.ENGINE === 'InnoDB'), 'Repair requires InnoDB source tables')
      await db.beginTransaction()
      // Lock both accounts and all their owner relations before checking either repair.
      const [accounts] = await db.query<Account[]>(`SELECT a.id, a.name, a.uuid, a.state, a.kind, a.balance,
        e.code AS exchangeCode, e.state AS exchangeState FROM ces_account a
        JOIN ces_exchange e ON e.id = a.exchange WHERE a.name IN ('XLCC0004', 'COOP2369') FOR UPDATE`)
      const xlcc = accounts.find(account => account.name === 'XLCC0004')
      const coop = accounts.find(account => account.name === 'COOP2369')
      assert(xlcc?.id === 8540 && xlcc.uuid === '060e6565-c106-43f2-af1b-63e20b6abd1c'
        && xlcc.exchangeCode === 'XLCC' && xlcc.exchangeState === 1 && xlcc.kind === 0 && xlcc.state === 1,
      'XLCC0004 no longer matches the reviewed active source account')
      // CesBankLocalAccount::STATE_HIDDEN = 0, STATE_ACTIVE = 1. Member.php maps 0 to pending/no account.
      assert(coop?.id === 8637 && coop.uuid === '1a0faf3f-17b5-4d4e-9cc5-0bdc6b391b1d'
        && coop.exchangeCode === 'COOP' && coop.exchangeState === 1 && coop.kind === 0
        && [0, 1].includes(coop.state) && Number(coop.balance) === 0,
      'COOP2369 no longer matches the reviewed zero-balance active/pending source account')
      const [owners] = await db.query<Owner[]>(
        'SELECT id, user, account, privilege FROM ces_accountuser WHERE account IN (?, ?) FOR UPDATE', [xlcc.id, coop.id],
      )
      const xlccOwner = owners.find(owner => owner.account === xlcc.id)
      const coopOwner = owners.find(owner => owner.account === coop.id)
      assert(owners.length === 2 && xlccOwner?.id === 8835 && xlccOwner.user === 8894
        && [0, 1].includes(xlccOwner.privilege) && coopOwner?.id === 8934 && coopOwner.user === 9009 && coopOwner.privilege === 0,
      'Source owner relations changed since review; no repair applied')
      const [users] = await db.query<RowDataPacket[]>('SELECT uid FROM users WHERE uid IN (8894, 9009) FOR UPDATE')
      assert(users.length === 2, 'A reviewed source owner no longer exists')
      // Check every transaction state, including pending/rejected history, in both directions.
      const [history] = await db.query<RowDataPacket[]>(`SELECT id FROM ces_transaction
        WHERE fromaccount = 'COOP2369' OR toaccount = 'COOP2369' LIMIT 1 FOR UPDATE`)
      assert(history.length === 0, 'COOP2369 has source financial history; no repair applied')

      if (values.apply) {
        if (xlccOwner.privilege === 1) {
          await db.execute('UPDATE ces_accountuser SET privilege = 0 WHERE id = ? AND privilege = 1', [xlccOwner.id])
        }
        if (coop.state === 1) {
          await db.execute('UPDATE ces_account SET state = 0 WHERE id = ? AND state = 1', [coop.id])
        }
        await db.commit()
      } else {
        await db.rollback()
      }
      const action = values.apply ? 'APPLIED' : 'PREVIEW'
      console.log(xlccOwner.privilege === 0 ? 'XLCC0004: already repaired'
        : `${action} XLCC0004: sole owner UID 8894, privilege 1 -> 0`)
      console.log(coop.state === 0 ? 'COOP2369: already pending'
        : `${action} COOP2369: state 1 -> 0 (pending); zero balance and no ICES transactions`)
    } catch (error) {
      await db.rollback()
      // Driver messages can contain connection details; print only the error code.
      if (error instanceof Error && 'code' in error && 'sqlState' in error) {
        throw new Error(`ICES database repair failed (${error.code})`)
      }
      throw error
    } finally {
      await db.end()
    }
  }
}
