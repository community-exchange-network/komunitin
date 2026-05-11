import TsJapi from 'ts-japi'
import { config } from '../../config'
import { SerializerOptions } from '../../server/jsonapi-serialize'
import type { Member } from './types'

const { Linker, Serializer } = TsJapi

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
    resource: new Linker((member) => `${config.API_BASE_URL}/${member.tenantId}/members/${member.id}`),
  },
})

export const serializeMember = async (member: Member, options?: SerializerOptions<Member>) => {
  return MemberSerializer.serialize(member, options)
}

export const serializeMembers = async (members: Member[], options?: SerializerOptions<Member>) => {
  return MemberSerializer.serialize(members, options)
}
