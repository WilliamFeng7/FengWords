import { defineEventHandler, getCookie } from 'h3'
import { cloudDb } from '../../utils/cloud-db'
import { privateResponse, requireWorkspace, SESSION_COOKIE } from '../../utils/cloud-session'

export default defineEventHandler(async event => {
  privateResponse(event)
  if (!process.env.DATABASE_URL) return { configured: false, provider: 'neon' }
  if (!getCookie(event, SESSION_COOKIE)) return { configured: true, authenticated: false, provider: 'neon' }
  const id = await requireWorkspace(event)
  const [row] =
    await cloudDb()`SELECT count(*)::int AS count, max(updated_at) AS updated_at FROM fw_records WHERE workspace_id = ${id}`
  return {
    configured: true,
    authenticated: true,
    provider: 'neon',
    workspaceId: id,
    records: row!.count,
    updatedAt: row!.updated_at,
  }
})
