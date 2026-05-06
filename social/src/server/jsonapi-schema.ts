import { z, type ZodType } from 'zod'

/**
 * From Zod schema for attributes to JSON:API resource object schema
 * (add support for relationships & others when needed).
 */
export const jsonApiResourceSchema = <
  TType extends string,
  TAttributes extends ZodType,
>(
  type: TType,
  attributesSchema: TAttributes,
) => z.object({
  type: z.literal(type).default(type),
  id: z.string().optional(),
  attributes: attributesSchema,
}).strict()

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
