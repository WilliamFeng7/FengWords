import assert from 'node:assert/strict'
const base = process.env.TEST_BASE_URL || 'http://localhost:5567'
function device() {
  let cookie = '',
    workspace = ''
  return {
    async request(path, method = 'GET', body, extra = {}) {
      const res = await fetch(base + '/api/cloud/' + path, {
        method,
        headers: {
          'Content-Type': 'application/json',
          'X-FengWords': '1',
          ...(cookie ? { Cookie: cookie } : {}),
          ...(workspace ? { 'X-FW-Workspace': workspace } : {}),
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      })
      const setCookie = res.headers.get('set-cookie')
      if (setCookie) cookie = setCookie.split(';')[0]
      const result = await res.json()
      if (path === 'session' && res.ok) workspace = result.workspaceId
      return { status: res.status, result, headers: res.headers }
    },
  }
}
const a = device(),
  b = device(),
  c = device()
assert.equal((await b.request('records')).status, 401)
const session = await a.request('session', 'POST', {})
assert.equal(session.status, 200)
assert.match(session.headers.get('set-cookie'), /HttpOnly/i)
assert.match(session.headers.get('set-cookie'), /SameSite=Lax/i)
assert.match(session.headers.get('cache-control'), /no-store/)
await b.request('session', 'POST', {})
const now = Date.now()
const row = (type, value, t = now) => ({
  type,
  data: { v: value, t, dev: 'api-test' },
  updated_at: new Date(t).toISOString(),
  data_version: 1,
})
const type = 'fw:notes:quoted-"-中文-:' + now
assert.equal((await a.request('records', 'PUT', { rows: [row(type, 'new')] })).status, 200)
assert.equal((await b.request('records')).result.rows.length, 0, 'Another library must not see the first library')
assert.equal(
  (await a.request('records', 'PUT', { rows: [row(type, 'old', now - 1000)] })).result.accepted.length,
  0,
  'Stale data must not overwrite new data'
)
assert.equal(
  (await a.request('records?types=' + encodeURIComponent(JSON.stringify([type])))).result.rows[0].data.v,
  'new'
)
assert.equal((await a.request('records', 'PUT', { rows: [row('invalid-table', 'no')] })).status, 400)
assert.equal((await a.request('records', 'PUT', { rows: [row(type, 'future', now + 3600000)] })).status, 400)
assert.equal(
  (await a.request('records', 'PUT', { rows: [row(type, 'no')] }, { Origin: 'https://evil.example' })).status,
  403
)
assert.equal(
  (
    await a.request(
      'records',
      'PUT',
      { rows: [row(type, 'no')] },
      { 'X-FW-Workspace': 'not-' + session.result.workspaceId }
    )
  ).status,
  409
)
const key = (await a.request('recovery', 'POST', {})).result.code
assert.ok(key && key.startsWith('fw1.'))
assert.equal((await c.request('session', 'POST', { code: key })).status, 200)
assert.equal(
  (await c.request('records?types=' + encodeURIComponent(JSON.stringify([type])))).result.rows[0].data.v,
  'new',
  'Recovery on another device'
)
const list = Array.from({ length: 6 }, (_, i) => row('fw:notes:pagination-' + i, 'page-' + i))
await a.request('records', 'PUT', { rows: list })
const types = list.map(r => r.type)
let next = '',
  all = []
do {
  const q = new URLSearchParams({ types: JSON.stringify(types), limit: '2', ...(next ? { after: next } : {}) })
  const page = (await c.request('records?' + q)).result
  all.push(...page.rows)
  next = page.next
} while (next)
assert.equal(all.length, 6)
assert.equal(new Set(all.map(r => r.type)).size, 6)
await a.request('records', 'PUT', {
  rows: [{ ...row(type, null, now + 1), data: { del: 1, t: now + 1, dev: 'api-test' } }],
})
assert.equal(
  (await c.request('records?types=' + encodeURIComponent(JSON.stringify([type])))).result.rows[0].data.del,
  1
)
console.log(
  'Cloud integration passed: online CRUD, isolation, cookies, recovery, stale-write protection, validation, CSRF, workspace binding, pagination and tombstones.'
)
console.log('Test data remains isolated in test-only workspaces; no user data was deleted.')
