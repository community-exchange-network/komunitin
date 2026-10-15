import { bearerJsonRequest, parseCredentialArgs, publicApiUrl, userToken } from '../utils.ts'

type ResourceIdentifier = {
  type: string
  id: string
}

type UserDocument = {
  data: ResourceIdentifier
}

type MemberResource = ResourceIdentifier & {
  relationships: {
    group: { data: ResourceIdentifier }
    account?: { data?: ResourceIdentifier }
  }
}

type GroupResource = ResourceIdentifier & {
  attributes: { code: string }
}

type MembersDocument = {
  data: MemberResource[]
  included?: GroupResource[]
}

const usage = 'Usage: komunitin accounting create-credit-commons-node <currency-code> <node-url> [--email <email>] [--password <password>]'

const withTrailingSlash = (value: string) => {
  const url = new URL(value)
  if (!url.pathname.endsWith('/')) url.pathname += '/'
  return url.toString()
}

const findAccountId = (document: MembersDocument, currencyCode: string) => {
  const group = document.included?.find((resource) => (
    resource.type === 'groups' && resource.attributes.code === currencyCode
  ))
  const member = document.data.find((resource) => resource.relationships.group.data.id === group?.id)
  const account = member?.relationships.account?.data
  if (!account || account.type !== 'accounts') {
    throw new Error(`Could not find an account for currency ${currencyCode}`)
  }
  return account.id
}

export const createCreditCommonsNode = async (args: string[]) => {
  const { values, positionals } = parseCredentialArgs(args)
  if (positionals.length !== 2) throw new Error(usage)

  const [currencyCode, nodeUrl] = positionals
  const remoteUrl = withTrailingSlash(nodeUrl)
  const token = await userToken(values, 'social:read accounting:write')
  const socialUrl = publicApiUrl('KOMUNITIN_SOCIAL_URL')
  const user = await bearerJsonRequest<UserDocument>(
    'Could not load the authenticated Social user',
    new URL('/users/me', socialUrl),
    token.access_token,
  )
  const members = await bearerJsonRequest<MembersDocument>(
    'Could not load the authenticated user memberships',
    new URL(`/users/${encodeURIComponent(user.data.id)}/members?include=group,account`, socialUrl),
    token.access_token,
  )
  const vostroId = findAccountId(members, currencyCode)

  await bearerJsonRequest(
    `Could not create the Credit Commons node for ${currencyCode}`,
    new URL(`/${encodeURIComponent(currencyCode)}/cc/nodes`, publicApiUrl('KOMUNITIN_ACCOUNTING_URL')),
    token.access_token,
    {
      method: 'POST',
      body: {
        data: {
          attributes: {
            peerNodePath: 'trunk',
            ourNodePath: `trunk/${currencyCode}`,
            url: remoteUrl,
            lastHash: 'trunk',
            vostroId,
          },
          relationships: {
            vostro: {
              data: { type: 'accounts', id: vostroId },
            },
          },
        },
      },
    },
  )

  console.log(`Created Credit Commons node for ${currencyCode}`)
}
