import TsJapi from 'ts-japi'
import { externalResourceSerializer, getResourceLink, relatedResource, SerializerOptions } from '../../server/jsonapi-serialize'
import { GroupSerializer } from '../groups/serialize'
import type { SerializableGroup } from '../groups/types'
import { postRelationships } from '../posts/relationship-serialize'
import type { Member, SerializableMember } from './types'

const { Linker, Serializer, Relator } = TsJapi
const ExternalAccountSerializer = externalResourceSerializer<{ id: string; href: string }>('accounts')

/** Format full and minimal member profiles. */
class MemberProfileSerializer extends Serializer<SerializableMember> {
  override async createResource(...args: Parameters<TsJapi.Serializer<SerializableMember>['createResource']>) {
    const resource = await super.createResource(...args)
    const [member] = args
    if (!('status' in member)) {
      resource.attributes = { name: member.name, image: member.image }
      resource.relationships = {
        group: resource.relationships!.group,
        account: resource.relationships!.account,
      }
    }
    return resource
  }
}

const memberProjection: SerializerOptions<Member>['projection'] = {
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
}

export const MemberSerializer = new MemberProfileSerializer('members', {
  version: null,
  projection: memberProjection,
  linkers: {
    resource: new Linker((member) => getResourceLink("members", member.tenantId, member.id)),
  },
  relators: {
    ...postRelationships<SerializableMember>('member'),
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
})

export const serializeMember = async (member: SerializableMember, options?: SerializerOptions<SerializableMember>) => {
  return MemberSerializer.serialize(member, options)
}

export const serializeMembers = async (members: SerializableMember[], options?: SerializerOptions<SerializableMember>) => {
  return MemberSerializer.serialize(members, options)
}
