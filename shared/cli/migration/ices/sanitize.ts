import type { IcesRow, IcesRows } from './bundle'
import { icesUserUid } from './bundle'

export interface IcesSourceUser {
  uid: number
  mail: string
  pass: string
  status: number
  language: string
}

const normalizedEmail = (email: string) => email.trim().toLowerCase()

const fixUrl = (value: string) => {
  const trimmed = value.trim()
  let result: string | null = trimmed ? null : ''
  if (trimmed && !/\s/.test(trimmed)) {
    const candidate = trimmed.startsWith('//') ? `https:${trimmed}`
      : /^[a-z][a-z\d+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`
    try {
      const url = new URL(candidate)
      if (['http:', 'https:'].includes(url.protocol) && url.hostname && !url.username && !url.password
        && (url.hostname.includes('.') || /^https?:\/\//i.test(trimmed))) {
        result = candidate
      }
    } catch {
      // The caller decides whether an unrepairable URL can be omitted.
    }
  }
  return result
}

// Add one calendar month in UTC, clamping January 31 to the end of February.
const nextMonth = (date: Date) => {
  const result = new Date(date)
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + 1)
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(date.getUTCDate(), lastDay))
  return result.toISOString()
}

/** Plan identities across the entire source so every community uses the same survivor. */
export const createIcesSanitizer = (source: IcesSourceUser[], onProgress: (message: string) => void = () => {}) => {
  const byUid = new Map(source.map(user => [user.uid, user]))
  const byEmail = new Map<string, IcesSourceUser[]>()
  for (const user of [...source].sort((a, b) => a.uid - b.uid)) {
    const email = normalizedEmail(user.mail)
    const users = byEmail.get(email) ?? []
    users.push(user)
    byEmail.set(email, users)
  }

  return (rows: IcesRows) => {
    const stats = { redactedEmails: 0, mergedUsers: 0, fixedUrls: 0, clearedWebsites: 0, blankFields: 0, fixedExpiryDates: 0, removedPosts: 0 }
    const users = new Map<number, IcesRow>()
    const exported = new Map(rows['users.csv'].map(row => [icesUserUid(row.id), row]))
    const references = new Map<string, string>()
    for (const row of rows['users.csv']) {
      const uid = icesUserUid(row.id)
      const original = byUid.get(uid)
      if (!original || normalizedEmail(original.mail) !== normalizedEmail(row.email)) {
        throw new Error(`ICES source identity mismatch for UID ${uid}; keep source writes paused`)
      }
      const email = normalizedEmail(original.mail)
      const matches = byEmail.get(email)!
      const redact = !email || email === 'deleted@deleted.org' || (original.status !== 1 && matches.length > 1)
      const canonical = !redact && original.status === 1 ? matches.find(user => user.status === 1)! : original
      const id = row.id.slice(0, -12) + canonical.uid.toString(16).padStart(12, '0')
      references.set(row.id, id)
      if (redact) stats.redactedEmails++
      if (canonical.uid !== uid) stats.mergedUsers++
      if (!users.has(canonical.uid)) {
        users.set(canonical.uid, {
          ...(exported.get(canonical.uid) ?? { language: canonical.language }),
          id, email: redact ? `deleted-${uid}@deleted.invalid` : email,
          // Use the survivor's credentials and language even when it belongs
          // to another community and was not returned by this API export.
          passwordHash: canonical.pass, status: canonical.status === 1 ? 'active' : 'disabled',
        })
      }
    }
    rows['users.csv'] = [...users.values()]
    for (const row of rows['member-users.csv']) row.user = references.get(row.user)!
    for (const row of rows['community.csv']) {
      row.adminUsers = [...new Set(row.adminUsers.split(';').map(id => references.get(id)!))].join(';')
    }

    for (const row of Object.values(rows).flat()) {
      for (const [key, value] of Object.entries(row)) {
        if (key !== 'passwordHash' && value && !value.trim()) {
          row[key] = ''
          stats.blankFields++
        } else if (key === 'contact.website' && fixUrl(value) === null) {
          row[key] = ''
          stats.clearedWebsites++
        } else if (key === 'contact.website' || key === 'imageUrl' || key === 'imageUrls') {
          const fixed = value.split(';').map(url => fixUrl(url) ?? url.trim()).join(';')
          if (fixed !== value) stats.fixedUrls++
          row[key] = fixed
        }
      }
    }
    rows['posts.csv'] = rows['posts.csv'].filter(row => {
      const keep = Boolean(row.description?.trim())
      if (!keep) stats.removedPosts++
      return keep
    })
    for (const row of rows['posts.csv']) {
      const created = new Date(row.createdAt)
      if (new Date(row.expiresAt) < created) {
        row.expiresAt = nextMonth(created)
        stats.fixedExpiryDates++
      }
    }
    onProgress(`ICES sanitization: ${JSON.stringify(stats)}`)
  }
}
