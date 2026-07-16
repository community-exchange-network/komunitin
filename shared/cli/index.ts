import { bootstrapAdmin } from './admin/bootstrap.ts'

const usage = 'Usage: komunitin admin bootstrap [--password=<password>]'

const main = async () => {
  const [resource, command, ...args] = process.argv.slice(2)

  if ([resource, command].join(' ') === 'admin bootstrap') {
    await bootstrapAdmin(args)
    return
  }

  throw new Error(usage)
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
