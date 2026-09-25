import { migrateSocial } from './admin/migrate.ts'
import { generateIcesBundle } from './migration/generate-ices.ts'
import { bootstrapAdmin } from './admin/bootstrap.ts'
import { createCreditCommonsNode } from './accounting/create-credit-commons-node.ts'
import { trustCurrency } from './accounting/trust.ts'

const commands = new Map<string, (args: string[]) => Promise<void>>([
  ['admin bootstrap', bootstrapAdmin],
  ['admin migrate', migrateSocial],
  ['admin bundle ices', generateIcesBundle],
  ['accounting trust', trustCurrency],
  ['accounting create-credit-commons-node', createCreditCommonsNode],
])

export const usage = `Usage:
  komunitin admin migrate <bundle.zip> [--email <email>] [--password <password>]
  komunitin admin bundle ices --url <ICES site URL> (--code <CODE> | --all) --output <path> [--page-size <100>]
  komunitin admin bootstrap [--password <password>]
  komunitin accounting trust <currency-code> <trusted-code> <amount> [--email <email>] [--password <password>]
  komunitin accounting create-credit-commons-node <currency-code> <node-url> [--email <email>] [--password <password>]`

export const main = async (args = process.argv.slice(2)) => {
  const bundleGenerator = args.slice(0, 3).join(' ')
  const commandLength = commands.has(bundleGenerator) ? 3 : 2
  const handler = commands.get(args.slice(0, commandLength).join(' '))
  if (!handler) throw new Error(usage)

  await handler(args.slice(commandLength))
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : error)
    process.exitCode = 1
  })
}
