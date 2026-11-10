import TsJapi from 'ts-japi'
import { PolymorphicSerializer } from '../../utils/polymorphic-serializer'
import { externalResourceSerializer, getResourceLink, relatedResource, SerializerOptions } from '../../server/jsonapi-serialize'
import { GroupSerializer } from '../groups/serialize'
import type { SerializableGroup } from '../groups/types'
import { postRelationships } from '../posts/relationship-serialize'
import type { SerializableMember } from './types'

const { Linker, Serializer, Relator } = TsJapi
const ExternalAccountSerializer = externalResourceSerializer<{ id: string; href: string }>('accounts')

const linkers = {
  resource: new Linker((member: SerializableMember) => getResourceLink('members', member.tenantId, member.id)),
}

const relators = {
  group: new Relator<SerializableMember, SerializableGroup>(
    async (member) => relatedResource(member.groupId, member.group),
    GroupSerializer,
    { relatedName: 'group' },
  ),
  account: new Relator<SerializableMember, { id: string; href: string }>(async (member) => {
    if (!member.accountId || !member.accountHref) {
      return undefined
    }

    return {
      id: member.accountId,
      href: member.accountHref,
    }
  }, ExternalAccountSerializer, { relatedName: 'account' }),
}

const MinimalMemberSerializer = new Serializer<SerializableMember>('members', {
  version: null,
  projection: { code: 1, name: 1, image: 1 },
  linkers,
  relators,
})

const FullMemberSerializer = new Serializer<Extract<SerializableMember, { status: string }>>('members', {
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
  linkers,
  relators: {
    ...relators,
    ...postRelationships<SerializableMember>('member'),
  }
})

export const MemberSerializer = new PolymorphicSerializer<SerializableMember>('members', 'profile', {
  full: FullMemberSerializer,
  minimal: MinimalMemberSerializer,
})

// Expose shared relationships for nested includes such as member.group.
MemberSerializer.setRelators(relators)

export const serializeMember = async (member: SerializableMember, options?: SerializerOptions<SerializableMember>) => {
  return MemberSerializer.serialize(member, options)
}

export const serializeMembers = async (members: SerializableMember[], options?: SerializerOptions<SerializableMember>) => {
  return MemberSerializer.serialize(members, options)
}
