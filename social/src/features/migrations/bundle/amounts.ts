const DECIMAL_PATTERN = /^-?(0|[1-9][0-9]*)(\.[0-9]+)?$/
const MIN_SIGNED_64 = -(1n << 63n)
const MAX_SIGNED_64 = (1n << 63n) - 1n

export type ExactAmountResult =
  | { success: true, value: bigint }
  | { success: false, code: 'INVALID_AMOUNT' | 'AMOUNT_PRECISION' | 'AMOUNT_OUT_OF_RANGE', message: string }

export const parseExactAmount = (input: string, scale: number): ExactAmountResult => {
  if (!DECIMAL_PATTERN.test(input)) {
    return {
      success: false,
      code: 'INVALID_AMOUNT',
      message: 'Amount must use plain decimal syntax without a leading plus sign or exponent',
    }
  }

  const negative = input.startsWith('-')
  const unsigned = negative ? input.slice(1) : input
  const [integer, fraction = ''] = unsigned.split('.')
  if (fraction.length > scale) {
    return {
      success: false,
      code: 'AMOUNT_PRECISION',
      message: `Amount has more than ${scale} fractional digits`,
    }
  }

  const digits = `${integer}${fraction.padEnd(scale, '0')}`
  // A signed 64-bit integer has at most 19 base-10 digits. Avoid constructing
  // arbitrarily large BigInts from malformed operator input.
  if (digits.length > 19) {
    return {
      success: false,
      code: 'AMOUNT_OUT_OF_RANGE',
      message: 'Scaled amount is outside the signed 64-bit range',
    }
  }

  const magnitude = BigInt(digits)
  const value = negative ? -magnitude : magnitude
  if (value < MIN_SIGNED_64 || value > MAX_SIGNED_64) {
    return {
      success: false,
      code: 'AMOUNT_OUT_OF_RANGE',
      message: 'Scaled amount is outside the signed 64-bit range',
    }
  }

  return { success: true, value }
}

