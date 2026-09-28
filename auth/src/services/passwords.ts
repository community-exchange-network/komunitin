import bcrypt from 'bcrypt'
import { createHash, timingSafeEqual } from 'node:crypto'
import { setImmediate } from 'node:timers/promises'

const DRUPAL_BASE64 = './0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz'

/** Hash a password using bcrypt. */
export function hashPassword(password: string) {
  return bcrypt.hash(password, 10)
}

/** Check if a password hash needs to be updatedc (i.e., if it is a legacy Drupal hash). **/
export function isLegacyPasswordHash(hash: string) {
  return isDrupalPasswordHash(hash)
}

/** Verify bcrypt or an imported Drupal 7 password hash using its stored settings. */
export async function verifyPassword(password: string, hash: string) {
  return isDrupalPasswordHash(hash)
    ? verifyDrupalPassword(password, hash)
    : bcrypt.compare(password, hash)
}

function isDrupalPasswordHash(hash: string) {
  return hash.startsWith('$S$')
}

// Drupal 7's password.inc: https://api.drupal.org/api/drupal/includes!password.inc/7.x
async function verifyDrupalPassword(password: string, storedHash: string) {
  const countLog2 = DRUPAL_BASE64.indexOf(storedHash.charAt(3))
  if (storedHash.length !== 55 || !/^\$S\$[./0-9A-Za-z]{52}$/.test(storedHash)
    || countLog2 < 7 || countLog2 > 30 || Buffer.byteLength(password) > 512) {
    return false
  }

  const secret = Buffer.from(password)
  let digest = createHash('sha512').update(storedHash.slice(4, 12)).update(secret).digest()
  for (let i = 0; i < 2 ** countLog2; i++) {
    digest = createHash('sha512').update(digest).update(secret).digest()
    // Let other requests progress while stretching the legacy password.
    if ((i + 1) % 1024 === 0) await setImmediate()
  }

  // Portable phpass encodes least-significant bits first with its own alphabet.
  let encoded = ''
  let value = 0
  let bits = 0
  for (const byte of digest) {
    value |= byte << bits
    bits += 8
    while (bits >= 6) {
      encoded += DRUPAL_BASE64[value & 63]
      value >>= 6
      bits -= 6
    }
  }
  if (bits > 0) encoded += DRUPAL_BASE64[value & 63]

  const calculated = (storedHash.slice(0, 12) + encoded).slice(0, 55)
  return timingSafeEqual(Buffer.from(calculated), Buffer.from(storedHash))
}
