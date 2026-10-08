import { badRequest } from '../utils/error'

const signed64BitLimit = 1n << 63n
const stellarScale = 7

/** Convert decimal CSV units to scaled integers without passing through floating point. */
export const exactAmount = (value: string, scale: number) => {
  if (!/^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/.test(value)) {
    throw badRequest('Invalid decimal amount')
  }

  const [whole, fraction = ''] = value.replace(/^-/, '').split('.')
  if (fraction.length > scale) {
    throw badRequest('Amount exceeds currency scale')
  }

  const digits = whole + fraction.padEnd(scale, '0')
  if (digits.length > 19) {
    throw badRequest('Amount exceeds signed 64-bit range')
  }
  const amount = BigInt(digits) * (value.startsWith('-') ? -1n : 1n)
  if (amount < -signed64BitLimit || amount >= signed64BitLimit) {
    throw badRequest('Amount exceeds signed 64-bit range')
  }
  return amount
}

/** The controller accepts numbers; reject any conversion that could round a scaled integer. */
export const ledgerNumber = (amount: string | bigint) => {
  const value = Number(amount)
  if (!Number.isSafeInteger(value)) {
    throw badRequest('Amount exceeds the exact integer range supported by the accounting ledger adapter')
  }
  return value
}

/** Check that an absolute amount fits both the controller and Stellar's seven-decimal units. */
export const validateLedgerAmount = (amount: bigint, scale: number) => {
  ledgerNumber(amount)
  if (scale > stellarScale && amount % (10n ** BigInt(scale - stellarScale)) !== 0n) {
    throw badRequest('Amount exceeds Stellar precision (7 decimals)')
  }
  if (scale < stellarScale && amount * 10n ** BigInt(stellarScale - scale) >= signed64BitLimit) {
    throw badRequest('Amount exceeds Stellar range')
  }
}
