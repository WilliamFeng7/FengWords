import { defineEventHandler, deleteCookie } from 'h3'
import { requireSameOrigin, SESSION_COOKIE } from '../../utils/cloud-session'

// Only forget this device's session. No cloud data is deleted.
export default defineEventHandler(event => {
  requireSameOrigin(event)
  deleteCookie(event, SESSION_COOKIE, { path: '/' })
  return { ok: true }
})
