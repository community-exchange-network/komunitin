import { parse } from 'csv-parse/sync'
import { z } from 'zod'
import { badRequest } from '../../utils/error'
import { normalizeEmail } from '../../utils/email'

const optional = <T extends z.ZodType>(schema: T) => z.union([z.literal(''), schema])
const timestamp = optional(z.iso.datetime({ offset: true }))
const passwordHash = z.string().refine(value => value === ''
  || /^\$2[ab]\$(?:0[4-9]|[12][0-9]|3[01])\$[./A-Za-z0-9]{53}$/.test(value)
  || /^\$S\$[5-9A-S][./A-Za-z0-9]{51}$/.test(value))
const userSchema = z.object({
  id: optional(z.uuid()).transform(value => value.toLowerCase()),
  email: z.string().transform(normalizeEmail).pipe(z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/)),
  name: z.string().max(255),
  status: optional(z.enum(['active', 'disabled'])),
  passwordHash,
  language: z.string().max(31),
  createdAt: timestamp,
  updatedAt: timestamp,
}).refine(row => !row.createdAt || !row.updatedAt || Date.parse(row.updatedAt) >= Date.parse(row.createdAt))

/** Validate the standalone users.csv contract without ever echoing credential values. */
export const parseUsersCsv = (bytes: Buffer) => {
  let records: string[][]
  try {
    const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes)
    records = parse(text, { bom: true })
  } catch {
    throw badRequest('Invalid UTF-8 or RFC 4180 users.csv')
  }
  const headers = records[0]
  const columns = Object.keys(userSchema.shape)
  if (!headers || !headers.includes('email') || new Set(headers).size !== headers.length
    || headers.some(header => !columns.includes(header))) {
    throw badRequest('users.csv must have unique documented columns, including email')
  }
  if (records.length > 100_001) throw badRequest('users.csv exceeds 100000 users')
  const emails = new Set<string>()
  const ids = new Set<string>()
  return records.slice(1).map((row, index) => {
    const result = userSchema.safeParse(Object.fromEntries(columns.map(column => [
      column, headers.includes(column) ? row[headers.indexOf(column)] : '',
    ])))
    if (!result.success) {
      const fields = [...new Set(result.error.issues.map(issue => issue.path.join('.')))].join(', ')
      throw badRequest(`Invalid users.csv row ${index + 2}${fields ? ` (${fields})` : ''}`)
    }
    const user = result.data
    if (emails.has(user.email) || (user.id && ids.has(user.id))) {
      throw badRequest(`Duplicate email or UUID in users.csv row ${index + 2}`)
    }
    emails.add(user.email)
    if (user.id) ids.add(user.id)
    return user
  })
}
