import { z } from 'zod'

export const normalizeEmail = (email: string) => email.trim().toLowerCase()

export const normalizedEmailSchema = z.preprocess(
  (value) => typeof value === 'string' ? normalizeEmail(value) : value,
  z.email(),
)
