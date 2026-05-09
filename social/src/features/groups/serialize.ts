import TsJapi from 'ts-japi'
import { config } from '../../config'
import { SerializerOptions } from '../../server/jsonapi-serialize'
import type { GroupSettings } from './schema'
import type { Group } from './types'

const { Linker, Relator, Serializer } = TsJapi

type OutputGroupSettings = GroupSettings & { 
  groupCode: string
  groupId: string
}

const GroupSettingsSerializer = new Serializer<OutputGroupSettings>('group-settings', {
  version: null,
  projection: {
    requireAcceptTerms: 1,
    terms: 1,
    minOffers: 1,
    minNeeds: 1,
    allowAnonymousMemberList: 1,
    enableGroupEmail: 1,
    defaultGroupEmailFrequency: 1,
  },
  linkers: {
    resource: new Linker((settings) => `${config.API_BASE_URL}/${settings.groupCode}/settings`)
  },
  idKey: 'groupId',
  
})

const GroupSerializer = new Serializer<Group>('groups', {
  version: null,
  projection: {
    code: 1,
    name: 1,
    description: 1,
    status: 1,
    access: 1,
    image: 1,
    address: 1,
    contacts: 1,
    location: 1,
    created: 1,
    updated: 1,
  },
  relators: {
    settings: new Relator<Group, OutputGroupSettings>(async (group) => {
      if (!group.settings) {
        return undefined
      }

      return {
        groupCode: group.code,
        groupId: group.id,
        ...group.settings,
      }
    }, GroupSettingsSerializer, { relatedName: 'settings' })
  },
  linkers: {
    resource: new Linker((group) => `${config.API_BASE_URL}/${group.code}`)
  }
})


export const serializeGroup = async (group: Group, options?: SerializerOptions<Group>) => {
  return GroupSerializer.serialize(group, options)
}


export const serializeGroups = async (groups: Group[], options?: SerializerOptions<Group>) => {
  return GroupSerializer.serialize(groups, options)
}

export const serializeGroupSettings = async (group: Group) => {
  return GroupSettingsSerializer.serialize({
    groupCode: group.code,
    groupId: group.id,
    ...group.settings,
  })
}
