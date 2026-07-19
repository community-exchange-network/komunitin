import { z } from 'zod'

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const mailboxEmailSchema = z.preprocess(
  (value) => {
    if (typeof value !== 'string') return value
    const address = value.trim()
    const mailbox = address.match(/<([^<>]+)>$/)?.[1] ?? address
    return normalizeEmail(mailbox)
  },
  z.email(),
)

export const normalizedEmailSchema = z.preprocess(
  (value) => typeof value === 'string' ? normalizeEmail(value) : value,
  z.email(),
)
