import { createError, defineEventHandler } from 'h3'
import { MAX_BATCH, rowTimestamp, validCloudRow } from '#shared/cloud'
import { cloudDb } from '../../utils/cloud-db'
import { jsonBody, rateLimit, requireSameOrigin, requireWorkspace } from '../../utils/cloud-session'

export default defineEventHandler(async event => {
  requireSameOrigin(event)
  const id = await requireWorkspace(event, true)
  await rateLimit(event, 'write', 300, 60, id)
  const body = await jsonBody(event)
  const rows = body?.rows
  if (!Array.isArray(rows) || !rows.length || rows.length > MAX_BATCH || !rows.every(row => validCloudRow(row))) {
    throw createError({ statusCode: 400, statusMessage: 'cloud_invalid_data' })
  }
  if (new Set(rows.map(row => row.type)).size !== rows.length)
    throw createError({ statusCode: 400, statusMessage: 'cloud_invalid_data' })
  const payload = rows.map(row => ({
    type: row.type,
    data: row.data,
    data_version: row.data_version,
    client_updated_ms: rowTimestamp(row),
  }))
  const sql = cloudDb()
  // The timestamp comparison is atomic in Postgres. A stale offline device cannot overwrite a newer value.
  const accepted = await sql`
    INSERT INTO fw_records (workspace_id, type, data, data_version, client_updated_ms)
    SELECT ${id}::uuid, r.type, r.data, r.data_version, r.client_updated_ms
      FROM jsonb_to_recordset(${JSON.stringify(payload)}::jsonb) AS r(type text, data jsonb, data_version integer, client_updated_ms bigint)
    ON CONFLICT (workspace_id, type) DO UPDATE SET data = EXCLUDED.data, data_version = EXCLUDED.data_version,
      client_updated_ms = EXCLUDED.client_updated_ms, updated_at = clock_timestamp()
    WHERE EXCLUDED.client_updated_ms > fw_records.client_updated_ms
    RETURNING type`
  return { accepted: accepted.map(row => row.type) }
})
