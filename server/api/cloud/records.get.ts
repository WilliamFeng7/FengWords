import { createError, defineEventHandler, getQuery } from 'h3'
import { isRecordType } from '#shared/cloud'
import { cloudDb } from '../../utils/cloud-db'
import { rateLimit, requireWorkspace } from '../../utils/cloud-session'

export default defineEventHandler(async event => {
  const id = await requireWorkspace(event, true)
  await rateLimit(event, 'read', 600, 60, id)
  const q = getQuery(event)
  const limit = Math.min(1000, Math.max(1, Number(q.limit) || 1000))
  let types: string[] | null = null
  try {
    if (q.types) types = JSON.parse(String(q.types))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'cloud_invalid_data' })
  }
  if (types && (!Array.isArray(types) || types.length > 100 || !types.every(isRecordType)))
    throw createError({ statusCode: 400, statusMessage: 'cloud_invalid_data' })
  const prefix = q.prefix === 'fw:' ? 'fw:%' : null
  const after = typeof q.after === 'string' && q.after.length <= 1024 ? q.after : ''
  const since = q.since ? new Date(String(q.since)) : new Date(0)
  if (!Number.isFinite(since.getTime())) throw createError({ statusCode: 400, statusMessage: 'cloud_invalid_data' })
  const metadata = q.metadata === 'true'
  const sql = cloudDb()
  const [clock] = await sql`SELECT clock_timestamp() AS now`
  // Keyset pagination rather than OFFSET: inserts/updates cannot move a page boundary.
  const rows = await sql`
    SELECT type, CASE WHEN ${metadata} THEN jsonb_build_object('t', client_updated_ms, 'del', data->'del') ELSE data END AS data,
      data_version, updated_at
    FROM fw_records WHERE workspace_id = ${id} AND type > ${after}
      AND (${types}::text[] IS NULL OR type = ANY(${types}::text[]))
      AND (${prefix}::text IS NULL OR type LIKE ${prefix}) AND updated_at >= ${since.toISOString()}::timestamptz
    ORDER BY type LIMIT ${limit + 1}`
  const more = rows.length > limit
  if (more) rows.pop()
  return { rows, next: more ? rows[rows.length - 1]!.type : null, serverTime: clock!.now }
})
