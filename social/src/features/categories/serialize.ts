import TsJapi from 'ts-japi'
import { config } from '../../config'
import { SerializerOptions } from '../../server/jsonapi-serialize'
import type { Category } from './types'

const { Linker, Serializer } = TsJapi

const CategorySerializer = new Serializer<Category>('categories', {
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
    resource: new Linker((category) => `${config.API_BASE_URL}/${category.tenantId}/categories/${category.id}`),
  },
})

export const serializeCategory = async (category: Category, options?: SerializerOptions<Category>) => {
  return CategorySerializer.serialize(category, options)
}

export const serializeCategories = async (categories: Category[], options?: SerializerOptions<Category>) => {
  return CategorySerializer.serialize(categories, options)
}
