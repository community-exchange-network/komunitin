import TsJapi from 'ts-japi'
import { externalResourceSerializer, getResourceLink, SerializerOptions } from '../../server/jsonapi-serialize'
import { getAccountingAccountHref } from '../../server/accounting'
import { GroupSerializer } from '../groups/serialize'
import { Group } from '../groups/types'
import type { Member } from './types'

const { Linker, Serializer, Relator } = TsJapi
const ExternalAccountSerializer = externalResourceSerializer<{ id: string; href: string }>('accounts')

export const MemberSerializer = new Serializer<Member>('members', {
  version: null,
  projection: {
    code: 1,
    name: 1,
    type: 1,
    status: 1,
    access: 1,
    description: 1,
    image: 1,
    address: 1,
    contacts: 1,
    location: 1,
    meta: 1,
    accountId: 1,
    created: 1,
    updated: 1,
  },
  linkers: {
    resource: new Linker((member) => getResourceLink("members", member.tenantId, member.id)),
  },
  relators: {
    group: new Relator<Member, Group>(async (member) => member.group, GroupSerializer, { relatedName: 'group' }),
    account: new Relator<Member, { id: string; href: string }>(async (member) => {
      if (!member.accountId) {
        return undefined
      }

      return {
        id: member.accountId,
        href: getAccountingAccountHref(member.tenantId, member.accountId),
      }
    }, ExternalAccountSerializer, { relatedName: 'account' })
  }
})

export const serializeMember = async (member: Member, options?: SerializerOptions<Member>) => {
  return MemberSerializer.serialize(member, options)
}

export const serializeMembers = async (members: Member[], options?: SerializerOptions<Member>) => {
  return MemberSerializer.serialize(members, options)
}
