import { bearerJsonRequest, parseCredentialArgs, publicApiUrl, requestJson, userToken } from '../utils.ts'

type CurrencyDocument = {
  data: {
    id: string
  }
}

const usage = 'Usage: komunitin accounting trust <currency-code> <trusted-code> <amount> [--email <email>] [--password <password>]'
const SCALE = 6

const parseAmount = (value: string) => {
  const match = value.match(/^(\d+)(?:\.(\d{1,6}))?$/)
  if (!match) throw new Error(`${usage}\nAmount must be a non-negative number with at most ${SCALE} decimal places`)

  const amount = BigInt(match[1]) * 10n ** BigInt(SCALE)
    + BigInt((match[2] ?? '').padEnd(SCALE, '0'))
  if (amount > BigInt(Number.MAX_SAFE_INTEGER)) throw new Error(`${usage}\nAmount is too large`)
  return Number(amount)
}

export const trustCurrency = async (args: string[]) => {
  const { values, positionals } = parseCredentialArgs(args)
  if (positionals.length !== 3) throw new Error(usage)

  const [currencyCode, trustedCode, amount] = positionals
  const limit = parseAmount(amount)
  const accountingUrl = publicApiUrl('KOMUNITIN_ACCOUNTING_URL')
  const trustedUrl = new URL(`/${encodeURIComponent(trustedCode)}/currency`, accountingUrl)
  const token = await userToken(values, 'accounting:write')
  const trusted = await requestJson<CurrencyDocument>(
    `Could not load currency ${trustedCode}`,
    trustedUrl,
  )

  await bearerJsonRequest(
    `Could not create trustline from ${currencyCode} to ${trustedCode}`,
    new URL(`/${encodeURIComponent(currencyCode)}/trustlines`, accountingUrl),
    token.access_token,
    {
      method: 'POST',
      body: {
        data: {
          type: 'trustlines',
          attributes: { limit },
          relationships: {
            trusted: {
              data: {
                type: 'currencies',
                id: trusted.data.id,
                meta: {
                  external: true,
                  href: trustedUrl.toString(),
                },
              },
            },
          },
        },
      },
    },
  )

  console.log(`Created ${currencyCode} trustline to ${trustedCode} for ${amount}`)
}
