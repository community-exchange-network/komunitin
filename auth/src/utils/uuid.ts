import { z } from 'zod'

const uuidSchema = z.guid()

export const isUuid = (value: string) => uuidSchema.safeParse(value).success
