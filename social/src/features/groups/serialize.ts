import TsJapi from 'ts-japi'
import { config } from '../../config'
import { getAccountingCurrencyUrl } from '../../clients/accounting'
import { externalResourceSerializer, getResourceLink, SerializerOptions, ToManyRelator } from '../../server/jsonapi-serialize'
import type { GroupSettings } from './schema'
import type { Group, SerializableGroup } from './types'

const { Linker, Relator, Serializer } = TsJapi
const ExternalCurrencySerializer = externalResourceSerializer<{ id: string; href: string }>('currencies')

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
    resource: new Linker((settings) => getResourceLink("group-settings", settings.groupCode, settings.groupId)),
  },
  idKey: 'groupId',
  
})

export const GroupSerializer = new Serializer<SerializableGroup>('groups', {
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
    settings: new Relator<SerializableGroup, OutputGroupSettings>(async (group) => {
      if (!group.settings) {
        return undefined
      }

      return {
        groupCode: group.code,
        groupId: group.id,
        ...group.settings,
      }
    }, GroupSettingsSerializer, { relatedName: 'settings' }),
    currency: new Relator<SerializableGroup, { id: string; href: string }>(async (group) => {
      if (!group.currencyId) {
        return undefined
      }

      return {
        id: group.currencyId,
        href: getAccountingCurrencyUrl(group.code),
      }
    }, ExternalCurrencySerializer, { relatedName: 'currency' }),
    admins: new ToManyRelator<SerializableGroup>(
      'admins',
      (group) => `${config.API_BASE_URL}/${group.code}/admins`,
      (group) => group.relationshipMeta.adminCount,
    ),
    members: new ToManyRelator<SerializableGroup>(
      'members',
      (group) => group.relationshipMeta.canListMembers
        ? `${config.API_BASE_URL}/${group.code}/members`
        : undefined,
      (group) => group.relationshipMeta.memberCount,
    ),
  },
  linkers: {
    resource: new Linker((group) => getResourceLink("groups", group.code, group.id)),
  }
})

export const serializeGroup = async (group: SerializableGroup, options?: SerializerOptions<SerializableGroup>) => {
  return GroupSerializer.serialize(group, options)
}


export const serializeGroups = async (groups: SerializableGroup[], options?: SerializerOptions<SerializableGroup>) => {
  return GroupSerializer.serialize(groups, options)
}

export const serializeGroupSettings = async (group: Group) => {
  return GroupSettingsSerializer.serialize({
    groupCode: group.code,
    groupId: group.id,
    ...group.settings,
  })
}
