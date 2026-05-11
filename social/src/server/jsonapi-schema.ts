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

export function jsonApiToOneRelationshipSchema<TType extends string>(
  type: TType,
) {
  return z.object({
    data: z.object({
      type: z.literal(type).default(type),
      id: z.uuid(),
    }),
  })
}

export function jsonApiToOneNullableRelationshipSchema<TType extends string>(
  type: TType,
) {
  return z.object({
    data: z.object({
      type: z.literal(type).default(type),
      id: z.uuid(),
    }).nullable(),
  })
}

