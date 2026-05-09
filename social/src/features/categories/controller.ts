import type { RequestHandler } from 'express'
import { getAuthContext, getOptionalAuthContext } from '../../server/context'
import { getValidatedBody } from '../../server/validation'
import type { CreateCategoryBody, PatchCategoryBody } from './schema'
import { serializeCategories, serializeCategory } from './serialize'
import { createCategory, deleteCategory, listCategories, patchCategory } from './service'
import { getCollectionParams, getCode, getParam } from '../../server/request'
import { getCollectionSerializerOptions } from '../../server/jsonapi-serialize'

export const getCategoriesRoute: RequestHandler = async (req, res) => {
  const ctx = getOptionalAuthContext(req)
  const code = getCode(req)
  const params = getCollectionParams(req, {
    filter: ['code', 'name', 'access'],
    sort: ['created', 'updated', 'name', 'code'],
  })

  const categories = await listCategories(ctx, code, params)
  
  const payload = await serializeCategories(categories, 
    getCollectionSerializerOptions(req.path, params, categories.length)
  )

  res.status(200).json(payload)
}

export const postCategoriesRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const body = getValidatedBody<CreateCategoryBody>(req)

  const category = await createCategory(ctx, code, body.data.attributes)
  const payload = await serializeCategory(category)
  res.status(201).json(payload)
}

export const patchCategoryRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const category = getParam(req, 'category')
  const body = getValidatedBody<PatchCategoryBody>(req)

  const updated = await patchCategory(ctx, code, category, body.data.attributes)
  const payload = await serializeCategory(updated)
  res.status(200).json(payload)
}

export const deleteCategoryRoute: RequestHandler = async (req, res) => {
  const ctx = getAuthContext(req)
  const code = getCode(req)
  const category = getParam(req, 'category')

  await deleteCategory(ctx, code, category)
  res.status(204).send()
}
