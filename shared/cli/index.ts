import { bootstrapAdmin } from './admin/bootstrap.ts'
import { createCreditCommonsNode } from './accounting/create-credit-commons-node.ts'
import { trustCurrency } from './accounting/trust.ts'

const commands = new Map<string, (args: string[]) => Promise<void>>([
  ['admin bootstrap', bootstrapAdmin],
  ['accounting trust', trustCurrency],
  ['accounting create-credit-commons-node', createCreditCommonsNode],
])

export const usage = `Usage:
  komunitin admin bootstrap [--password <password>]
  komunitin accounting trust <currency-code> <trusted-code> <amount> [--email <email>] [--password <password>]
  komunitin accounting create-credit-commons-node <currency-code> <node-url> [--email <email>] [--password <password>]`

export const main = async (args = process.argv.slice(2)) => {
  const [resource, command, ...commandArgs] = args
  const handler = commands.get([resource, command].join(' '))
  if (!handler) throw new Error(usage)

  await handler(commandArgs)
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
