import TsJapi from 'ts-japi'
import { externalResourceSerializer, getResourceLink, SerializerOptions } from '../../server/jsonapi-serialize'
import { getAccountingAccountUrl } from '../../clients/accounting'
import { GroupSerializer } from '../groups/serialize'
import type { SerializableGroup } from '../groups/types'
import { postRelationships } from '../posts/relationship-serialize'
import type { SerializableMember } from './types'

const { Linker, Serializer, Relator } = TsJapi
const ExternalAccountSerializer = externalResourceSerializer<{ id: string; href: string }>('accounts')

export const MemberSerializer = new Serializer<SerializableMember>('members', {
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
    ...postRelationships<SerializableMember>('member'),
    group: new Relator<SerializableMember, SerializableGroup>(async (member) => member.group, GroupSerializer, { relatedName: 'group' }),
    account: new Relator<SerializableMember, { id: string; href: string }>(async (member) => {
      if (!member.accountId) {
        return undefined
      }

      return {
        id: member.accountId,
        href: getAccountingAccountUrl(member.tenantId, member.accountId),
      }
    }, ExternalAccountSerializer, { relatedName: 'account' }),
  }
})

export const serializeMember = async (member: SerializableMember, options?: SerializerOptions<SerializableMember>) => {
  return MemberSerializer.serialize(member, options)
}

export const serializeMembers = async (members: SerializableMember[], options?: SerializerOptions<SerializableMember>) => {
  return MemberSerializer.serialize(members, options)
}
