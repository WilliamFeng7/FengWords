import { defineEventHandler, getCookie } from 'h3'
import { requireSameOrigin, requireWorkspace, SESSION_COOKIE } from '../../utils/cloud-session'

export default defineEventHandler(async event => {
  requireSameOrigin(event)
  await requireWorkspace(event)
  return { code: getCookie(event, SESSION_COOKIE) }
})
