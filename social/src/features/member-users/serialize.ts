import TsJapi from 'ts-japi'
import { getResourceLink, relatedResource, type SerializerOptions } from '../../server/jsonapi-serialize'
import { MemberSerializer } from '../members/serialize'
import type { SerializableMember } from '../members/types'
import { UserSerializer } from '../users/serialize'
import type { User } from '../users/types'
import type { EnrichedMemberUser, SerializableMemberUser } from './types'

const { Linker, Relator, Serializer } = TsJapi

const MemberUserSerializer = new Serializer<SerializableMemberUser>('member-users', {
  version: null,
  projection: {
    notifications: 1,
    emails: 1,
  },
  linkers: {
    resource: new Linker((relation) => getResourceLink('member-users', relation.tenantId, relation.id)),
  },
  relators: {
    member: new Relator<SerializableMemberUser, SerializableMember>(
      async (relation) => relatedResource(relation.memberId, relation.member),
      MemberSerializer,
      { relatedName: 'member' },
    ),
    user: new Relator<SerializableMemberUser, User>(
      async (relation) => relatedResource(relation.userId, relation.user),
      UserSerializer,
      { relatedName: 'user' },
    ),
  },
})

const toSerializable = (relation: EnrichedMemberUser): SerializableMemberUser => ({
  ...relation,
  ...relation.settings,
})

export const serializeMemberUser = async (
  relation: EnrichedMemberUser,
  options?: SerializerOptions<SerializableMemberUser>,
) => MemberUserSerializer.serialize(toSerializable(relation), options)

export const serializeMemberUsers = async (
  relations: EnrichedMemberUser[],
  options?: SerializerOptions<SerializableMemberUser>,
) => MemberUserSerializer.serialize(relations.map(toSerializable), options)
