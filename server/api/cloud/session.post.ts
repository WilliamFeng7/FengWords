import { randomBytes, randomUUID } from 'node:crypto'
import { defineEventHandler, getCookie } from 'h3'
import { cloudDb } from '../../utils/cloud-db'
import {
  hashToken,
  jsonBody,
  rateLimit,
  requireSameOrigin,
  saveSession,
  SESSION_COOKIE,
  validateCode,
} from '../../utils/cloud-session'

export default defineEventHandler(async event => {
  requireSameOrigin(event)
  const body = await jsonBody(event)
  let code = body?.code || getCookie(event, SESSION_COOKIE)
  let id: string
  if (code) {
    await rateLimit(event, 'connect', 30, 900)
    id = await validateCode(code)
  } else {
    await rateLimit(event, 'create', 10, 3600)
    id = randomUUID()
    const token = randomBytes(32).toString('base64url')
    code = `fw1.${id}.${token}`
    await cloudDb()`INSERT INTO fw_workspaces (id, access_hash) VALUES (${id}, ${hashToken(token)})`
  }
  saveSession(event, code)
  const [row] = await cloudDb()`SELECT count(*)::int AS count FROM fw_records WHERE workspace_id = ${id}`
  return { workspaceId: id, hasRecords: row!.count > 0 }
})
