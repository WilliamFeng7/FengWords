export const RECORD_TABLES = ['state', 'dicts', 'orders', 'entries', 'stats', 'fsrs', 'notes'] as const
export const DOCUMENT_TYPES = ['dict', 'setting', 'practice_word', 'practice_article'] as const
export const MAX_BATCH = 300
export const MAX_BODY_BYTES = 2 * 1024 * 1024

export interface CloudRow {
  type: string
  data: any
  data_version: number
  updated_at: string
}

export interface CloudListOptions {
  types?: string[]
  prefix?: string
  since?: string
  after?: string
  limit?: number
  metadata?: boolean
}

export interface CloudPage {
  rows: CloudRow[]
  next: string | null
  serverTime: string
}

export function isRecordType(type: unknown): type is string {
  return (
    typeof type === 'string' &&
    type.length <= 1024 &&
    (DOCUMENT_TYPES.includes(type as any) || /^fw:(state|dicts|orders|entries|stats|fsrs|notes):.+$/s.test(type))
  )
}

export function parseRecoveryCode(code: unknown): { id: string; token: string } | null {
  if (typeof code !== 'string') return null
  const match = /^fw1\.([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([A-Za-z0-9_-]{43})$/.exec(
    code.trim()
  )
  return match ? { id: match[1]!, token: match[2]! } : null
}

export function rowTimestamp(row: CloudRow): number {
  return row.type.startsWith('fw:') ? Number(row.data?.t) : Date.parse(row.updated_at)
}

export function validCloudRow(row: unknown, now = Date.now()): row is CloudRow {
  if (!row || typeof row !== 'object') return false
  const r = row as CloudRow
  if (!isRecordType(r.type) || !Number.isInteger(r.data_version) || r.data_version < 1 || r.data_version > 1000)
    return false
  if (!Object.hasOwn(r, 'data')) return false
  const timestamp = rowTimestamp(r)
  if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > now + 5 * 60_000) return false
  if (
    r.type.startsWith('fw:') &&
    (!r.data || typeof r.data !== 'object' || (!Object.hasOwn(r.data, 'v') && r.data.del !== 1))
  )
    return false
  return true
}
