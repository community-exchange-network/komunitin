import { z, type ZodType, type ZodOptional, type ZodObject, } from 'zod'


/**
 * From Zod schema for attributes to JSON:API resource object schema
 * (add support for relationships & others when needed).
 */

export const jsonApiResourceSchema = <
  TType extends string,
  TAttributes extends ZodType,
  TRelationships extends ZodType = ZodOptional<ZodObject<{}>>,
>(
  type: TType,
  attributesSchema: TAttributes,
  relationshipsSchema?: TRelationships,
) => {
  if (!relationshipsSchema) {
    relationshipsSchema = z.object({}).strict().optional() as unknown as TRelationships
  }
  return z.object({
    type: z.literal(type).default(type),
    id: z.uuid().optional(),
    attributes: attributesSchema,
    relationships: relationshipsSchema,
  }).strict()
}

export type JsonApiResource<TType extends string, TAttributes, TRelationships = never> = z.infer<ReturnType<typeof jsonApiResourceSchema<TType, ZodType<TAttributes>, ZodType<TRelationships>>>>

/**
 * From Data and optional included schemas to JSON:API document schema.
 */
export function jsonApiDocumentSchema<TData extends ZodType>(
  dataSchema: TData,
): z.ZodObject<{ data: TData }>
export function jsonApiDocumentSchema<
  TData extends ZodType,
  TIncluded extends ZodType,
>(
  dataSchema: TData,
  includedSchema: TIncluded | TIncluded[],
): z.ZodObject<{
  data: TData
  included: z.ZodOptional<z.ZodArray<TIncluded>>
}>

export function jsonApiDocumentSchema<
  TData extends ZodType,
  TIncluded extends ZodType,
>(
  dataSchema: TData,
  includedSchema?: TIncluded | TIncluded[],
) {
  return z.object({
    data: dataSchema,
    ...(includedSchema ? {
      included: z.array(Array.isArray(includedSchema) ? z.union(includedSchema) : includedSchema).optional(),
    } : {})
  }).strict()
}

export type JsonApiDocument<TData extends ZodType, TIncluded = never> = z.infer<ReturnType<typeof jsonApiDocumentSchema<TData, ZodType<TIncluded>>>>

export function jsonApiResourceIdSchema<TType extends string>(type: TType) {
  return z.object({
    type: z.literal(type).default(type),
    id: z.uuid(),
  })
}

export type JsonApiResourceId<TType extends string = string> = z.infer<ReturnType<typeof jsonApiResourceIdSchema<TType>>>

export function jsonApiToOneRelationshipSchema<TType extends string>(
  type: TType,
) {
  return z.object({
    data: jsonApiResourceIdSchema(type)
  })
}

export function jsonApiToOneNullableRelationshipSchema<TType extends string>(
  type: TType,
) {
  return z.object({
    data: jsonApiResourceIdSchema(type).nullable(),
  })
}

