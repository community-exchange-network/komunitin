import TsJapi from 'ts-japi'
import { getResourceLink, SerializerOptions } from '../../server/jsonapi-serialize'
import { postRelationships } from '../posts/relationship-serialize'
import type { SerializableCategory } from './types'

const { Linker, Serializer } = TsJapi

export const CategorySerializer = new Serializer<SerializableCategory>('categories', {
  version: null,
  projection: {
    code: 1,
    name: 1,
    access: 1,
    icon: 1,
    meta: 1,
    created: 1,
    updated: 1,
  },
  linkers: {
    resource: new Linker((category) => getResourceLink("categories", category.tenantId, category.id)),
  },
  relators: postRelationships<SerializableCategory>('category'),
})

export const serializeCategory = async (category: SerializableCategory, options?: SerializerOptions<SerializableCategory>) => {
  return CategorySerializer.serialize(category, options)
}

export const serializeCategories = async (categories: SerializableCategory[], options?: SerializerOptions<SerializableCategory>) => {
  return CategorySerializer.serialize(categories, options)
}
