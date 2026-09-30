import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
const base = process.env.TEST_BASE_URL || 'http://localhost:5567'
const pause = ms => new Promise(r => setTimeout(r, ms))
function ab(args, session = 'default') {
  return execFileSync('npx', ['--yes', 'agent-browser', '--session', session, ...args], {
    encoding: 'utf8',
    timeout: 60000,
    maxBuffer: 2e6,
  })
}
function evaluate(source, session = 'default') {
  return JSON.parse(ab(['eval', source], session))
}
async function until(check) {
  for (let i = 0; i < 12; i++) {
    if (check()) return
    await pause(1500)
  }
  throw new Error('Browser sync timed out')
}
const store = 'document.getElementById("__nuxt").__vue_app__.config.globalProperties.$pinia._s.get("base")'
const stamp = Date.now(),
  online = 'online-' + stamp,
  offline = 'offline-' + stamp
const query = '/api/cloud/records?types=' + encodeURIComponent(JSON.stringify(['fw:notes:cloud_e2e']))
const remote = () => evaluate(`fetch(${JSON.stringify(query)}).then(r=>r.json()).then(j=>j.rows?.[0]?.data?.v||null)`)
ab(['open', base + '/setting?index=6'])
ab(['wait', '--load', 'networkidle'])
evaluate(`(()=>{${store}.noteData.cloud_e2e=${JSON.stringify(online)};return true})()`)
await until(() => remote() === online)
console.log('PASS: frontend mutation automatically saved in real Neon database')
ab(['set', 'offline', 'on'])
evaluate(`(()=>{${store}.noteData.cloud_e2e=${JSON.stringify(offline)};return true})()`)
await pause(5000)
const local = evaluate(
  `new Promise((resolve,reject)=>{const open=indexedDB.open('fengwords');open.onsuccess=()=>{const db=open.result;const r=db.transaction('notes').objectStore('notes').get('cloud_e2e');r.onsuccess=()=>{resolve({v:r.result.v,dirty:r.result.dirty});db.close()};r.onerror=reject}})`
)
assert.equal(local.v, offline)
assert.equal(local.dirty, 1)
console.log('PASS: offline edit persisted locally and remained queued')
ab(['set', 'offline', 'off'])
await until(() => remote() === offline)
console.log('PASS: reconnect uploaded the queued edit')
// Never print or persist the recovery secret; pass it only to the isolated test browser.
const code = evaluate(
  'fetch("/api/cloud/recovery",{method:"POST",headers:{"X-FengWords":"1","Content-Type":"application/json"},body:"{}"}).then(r=>r.json()).then(j=>j.code)'
)
const b = 'fengwords-e2e-b'
ab(['open', base + '/setting?index=6'], b)
ab(['wait', '--load', 'networkidle'], b)
const before = evaluate(`fetch(${JSON.stringify(query)}).then(r=>r.json()).then(j=>j.rows?.length)`, b)
assert.equal(before, 0, 'Fresh browser must have an isolated library')
ab(['fill', '#cloud-restore-code', code], b)
ab(['check', 'form.cloud-section input[type=checkbox]'], b)
ab(['click', 'form.cloud-section button:not([type])'], b)
await pause(5000)
ab(['wait', '--load', 'networkidle'], b)
await until(() => evaluate(`(()=>${store}.noteData.cloud_e2e||null)()`, b) === offline)
assert.ok(
  evaluate(
    `new Promise(resolve=>{const o=indexedDB.open('keyval-store');o.onsuccess=()=>{const d=o.result;const r=d.transaction('keyval').objectStore('keyval').get('fw-cloud-restore-backup');r.onsuccess=()=>{resolve(!!r.result?.zip);d.close()}}})`,
    b
  )
)
console.log('PASS: recovery form restored the library on a second browser and retained a ZIP backup')
ab(['close'], b)
