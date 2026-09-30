import { nanoid } from 'nanoid'
import { Cloud, type CloudClient } from '../utils/cloud'
import { useBaseStore } from '../stores/base'
import { getDictSyncBlockReason } from '../composables/useDataSyncPersistence'
import {
  allRecordTables,
  getDb,
  getMeta,
  recordTable,
  setMeta,
  type StoredRow,
  SYNCED_TABLES,
  type SyncedTable,
} from './db'
import { ensureStudyContentLoaded, flushSave, reloadFromDb, reloadNow, withPersistenceLock } from './store-persistence'
import { applyCloudExtras } from './cloud-extras'

/**
 * 学习数据的云同步（用户自己的 Neon）：按单条记录合并。
 *
 * 云端 fw_records 按 workspace_id 隔离，每条记录占一行，通过同源后端接口读写。
 * type = 'fw:<表>:<key>'，和旧版的 dict / setting 等行互不影响。
 * - data = { v: 内容, t: 修改时间, d: 所属词典, dev: 上传设备 }，删除为 { del: 1, t, dev }
 * - updated_at = 上传时间：增量拉取按它走，离线很久才上传的改动也能被拉到；
 *   增量拉取跳过本机自己上传的行，不重复下载
 * - 冲突按每条记录的修改时间“较新优先”，不再整份互相覆盖
 * 设置和练习进度缓存仍按原来的整行方式同步。
 */

export const REMOTE_PREFIX = 'fw:'
export const RECORD_SYNC_VERSION = 1
/** 每页最多 1000 条，使用稳定的 keyset 游标 */
const PAGE = 1000
const PUSH_BATCH = 300
const IN_CHUNK = 80
/** 增量拉取往前多看一点，容忍设备间的时钟误差 */
const PULL_MARGIN = 2 * 60 * 1000
/** 每天做一次全量核对，兜住时钟误差很大的设备 */
const FULL_CHECK_INTERVAL = 24 * 60 * 60 * 1000
const CURSOR_KEY = 'syncCursor'
const FULL_CHECK_KEY = 'syncFullCheckAt'
const DEVICE_KEY = 'deviceId'

type RemoteRow = { type: string; data: any; updated_at: string; data_version?: number | null }

/** 云同步不可用时也保留待上传标记与删除记录，联网后可以重试。 */
export function isSyncConfigured(): boolean {
  return Cloud.isConfigured()
}

function activeClient(): CloudClient | null {
  if (!Cloud.check()) return null
  const reason = getDictSyncBlockReason(useBaseStore().$state)
  if (reason) {
    Cloud.setStatus('error', 'cloud_local_audio')
    return null
  }
  return Cloud.getInstance()
}

function parseType(type: string): { table: SyncedTable; key: string } | null {
  if (!type?.startsWith(REMOTE_PREFIX)) return null
  const rest = type.slice(REMOTE_PREFIX.length)
  const i = rest.indexOf(':')
  if (i < 0) return null
  const table = rest.slice(0, i) as SyncedTable
  if (!SYNCED_TABLES.includes(table)) return null
  return { table, key: rest.slice(i + 1) }
}

let deviceId: string | null = null

/** 本机（本浏览器）的标识，只用来在拉取时跳过自己上传的行 */
async function getDeviceId(): Promise<string> {
  if (deviceId) return deviceId
  let id = await getMeta<string>(DEVICE_KEY)
  if (!id) {
    id = nanoid(12)
    await setMeta(DEVICE_KEY, id)
  }
  return (deviceId = id)
}

function toRemote(name: SyncedTable, r: StoredRow, pushedAt: string, dev: string): RemoteRow {
  const data: any = r.del ? { del: 1, t: r.t } : { v: r.v, t: r.t }
  if (r.dict) data.d = r.dict
  data.dev = dev
  return { type: REMOTE_PREFIX + name + ':' + r.key, data, updated_at: pushedAt, data_version: RECORD_SYNC_VERSION }
}

/** 上传所有待上传的记录；上传期间又被改过的记录保持待上传 */
async function pushDirty(sb: CloudClient): Promise<number> {
  const db = getDb()
  const dev = await getDeviceId()
  let pushed = 0
  let canonicalChanges = 0
  for (const name of SYNCED_TABLES) {
    const table = recordTable(name)
    const rows = await table.where('dirty').equals(1).toArray()
    for (let i = 0; i < rows.length; i += PUSH_BATCH) {
      const chunk = rows.slice(i, i + PUSH_BATCH)
      const pushedAt = new Date().toISOString()
      const remote = chunk.map(r => toRemote(name, r, pushedAt, dev))
      const accepted = new Set(await sb.upsert(remote))
      await db.transaction('rw', table, async () => {
        const current = await table.bulkGet(chunk.map(r => r.key))
        const clean: string[] = []
        const purge: string[] = []
        current.forEach((c, j) => {
          if (!c || c.dirty !== 1 || c.t !== chunk[j].t) return
          if (c.del) purge.push(c.key)
          else clean.push(c.key)
        })
        if (clean.length) await table.bulkUpdate(clean.map(key => ({ key, changes: { dirty: 0 as const } })))
        if (purge.length) await table.bulkDelete(purge)
      })
      const rejected = remote.filter(r => !accepted.has(r.type)).map(r => r.type)
      for (let j = 0; j < rejected.length; j += IN_CHUNK) {
        canonicalChanges += await applyRemoteRows(await sb.getTypes(rejected.slice(j, j + IN_CHUNK)), true)
      }
      pushed += chunk.length
    }
  }
  if (canonicalChanges) {
    await applyCloudExtras()
    await reloadFromDb()
  }
  return pushed
}

/** 把云端记录并进本地：每条按修改时间较新优先。返回本地实际变了多少条 */
async function applyRemoteRows(rows: RemoteRow[], canonical = false): Promise<number> {
  const byTable = new Map<SyncedTable, Array<{ key: string; t: number; data: any }>>()
  for (const r of rows) {
    const p = parseType(r.type)
    // 更新版本写的数据，这个版本不认识，先不动
    if (!p || (r.data_version ?? 0) > RECORD_SYNC_VERSION) continue
    const data = r.data ?? {}
    const t = Number(data.t) || Date.parse(r.updated_at)
    if (!Number.isFinite(t)) continue
    let list = byTable.get(p.table)
    if (!list) byTable.set(p.table, (list = []))
    list.push({ key: p.key, t, data })
  }
  let changed = 0
  const db = getDb()
  for (const [name, items] of byTable) {
    const table = recordTable(name)
    await db.transaction('rw', table, async () => {
      const locals = await table.bulkGet(items.map(i => i.key))
      const puts: StoredRow[] = []
      const dels: string[] = []
      items.forEach((it, j) => {
        const local = locals[j]
        if (local && (local.t > it.t || (!canonical && local.t === it.t))) return
        if (it.data.del) {
          if (local) dels.push(it.key)
          return
        }
        if (!('v' in it.data)) return
        const row: StoredRow = { key: it.key, v: it.data.v, h: '', t: it.t, dirty: 0 }
        if (it.data.d) row.dict = it.data.d
        puts.push(row)
      })
      if (puts.length) await table.bulkPut(puts)
      if (dels.length) await table.bulkDelete(dels)
      changed += puts.length + dels.length
    })
  }
  return changed
}

/**
 * 增量拉取：上次拉取之后（往前多看 PULL_MARGIN）别的设备上传的记录。
 * 游标记的是本机开始拉取的时间，所以每次最多重复看到 PULL_MARGIN 这一小段。
 */
async function pullChanges(sb: CloudClient, full = false): Promise<number> {
  const cursor = Number(await getMeta(CURSOR_KEY)) || 0
  const since = full || !cursor ? undefined : new Date(Math.max(0, cursor - PULL_MARGIN)).toISOString()
  let changed = 0
  let after: string | undefined
  let startedAt = 0
  do {
    const page = await sb.list({ prefix: REMOTE_PREFIX, since, after, limit: PAGE })
    if (!startedAt) startedAt = Date.parse(page.serverTime)
    // Also read our own rows: a write can be rejected by the server when another device won the race.
    changed += await applyRemoteRows(page.rows)
    after = page.next || undefined
  } while (after)
  await setMeta(CURSOR_KEY, startedAt)
  return changed
}

/** 全量核对：只拉每行的类型和修改时间，本地缺的或更旧的再取内容 */
async function reconcileAll(sb: CloudClient): Promise<number> {
  const need: string[] = []
  let after: string | undefined
  do {
    const page = await sb.list({ prefix: REMOTE_PREFIX, metadata: true, after, limit: PAGE })
    const rows = page.rows.map(r => ({ type: r.type, et: r.data?.t, updated_at: r.updated_at }))
    const byTable = new Map<SyncedTable, Array<{ type: string; key: string; t: number }>>()
    for (const r of rows) {
      const p = parseType(r.type)
      if (!p) continue
      let list = byTable.get(p.table)
      if (!list) byTable.set(p.table, (list = []))
      list.push({ type: r.type, key: p.key, t: Number(r.et) || Date.parse(r.updated_at) })
    }
    for (const [name, items] of byTable) {
      const locals = await recordTable(name).bulkGet(items.map(i => i.key))
      items.forEach((it, j) => {
        if (!locals[j] || it.t > locals[j]!.t) need.push(it.type)
      })
    }
    after = page.next || undefined
  } while (after)
  let changed = 0
  for (let i = 0; i < need.length; i += IN_CHUNK) {
    changed += await applyRemoteRows(await sb.getTypes(need.slice(i, i + IN_CHUNK)))
  }
  await setMeta(FULL_CHECK_KEY, Date.now())
  return changed
}

let running: Promise<void> | null = null
let rerun = false

/**
 * 同步一次：先存本地改动 → 拉取别的设备的改动（有变化就重新读入界面）→ 上传本地改动。
 * 先拉后传，保证“较新优先”：别的设备更新过的记录不会被本机的旧改动覆盖。
 */
export function syncRecords(opts: { full?: boolean } = {}): Promise<void> {
  if (running) {
    rerun = true
    return running
  }
  running = (async () => {
    const sb = activeClient()
    if (!sb) return
    try {
      Cloud.setStatus('syncing')
      await flushSave()
      let changed = await pullChanges(sb, !!opts.full)
      const lastFull = Number(await getMeta(FULL_CHECK_KEY)) || 0
      if (opts.full || Date.now() - lastFull > FULL_CHECK_INTERVAL) changed += await reconcileAll(sb)
      if (changed) {
        await applyCloudExtras()
        await reloadFromDb()
      }
      await pushDirty(sb)
      Cloud.setStatus('success')
    } catch (e) {
      Cloud.setStatus('error', (e as Error)?.message ?? String(e))
    }
  })().finally(() => {
    running = null
    if (rerun) {
      rerun = false
      void syncRecords()
    }
  })
  return running
}

let pushTimer: ReturnType<typeof setTimeout> | null = null

/** 本地有改动：稍后同步（合并短时间内的多次改动） */
export function schedulePush(delay = 3000): void {
  if (!isSyncConfigured()) return
  if (pushTimer) clearTimeout(pushTimer)
  pushTimer = setTimeout(() => {
    pushTimer = null
    void syncRecords()
  }, delay)
}

/** 云端现存（未删除）的记录类型 */
async function listRemoteAliveTypes(sb: CloudClient): Promise<string[]> {
  const out: string[] = []
  let after: string | undefined
  do {
    const page = await sb.list({ prefix: REMOTE_PREFIX, metadata: true, after, limit: PAGE })
    for (const row of page.rows) if (!row.data?.del) out.push(row.type)
    after = page.next || undefined
  } while (after)
  return out
}

export async function hasRemoteRecords(sb: CloudClient): Promise<boolean> {
  return (await sb.list({ prefix: REMOTE_PREFIX, limit: 1 })).rows.length > 0
}

/** 首次接通线上数据库：上传已存在的本地记录，但不篡改原始修改时间。 */
export async function prepareCloudMigration(workspaceId: string): Promise<void> {
  if ((await getMeta('cloudWorkspace')) === workspaceId) return
  const db = getDb()
  await flushSave({ deep: true })
  await db.transaction('rw', [...allRecordTables(), db.meta], async () => {
    for (const name of SYNCED_TABLES) {
      const table = recordTable(name)
      const rows = await table.toArray()
      if (rows.length) await table.bulkPut(rows.map(r => ({ ...r, dirty: 1 as const })))
    }
    await db.meta.delete(CURSOR_KEY)
    await db.meta.delete(FULL_CHECK_KEY)
    await db.meta.put({ key: 'cloudWorkspace', v: workspaceId })
  })
}

/** 换设备恢复之前，等待旧工作空间所有请求完成，防止数据串到另一空间。 */
export async function drainRecordSync(): Promise<void> {
  if (pushTimer) {
    clearTimeout(pushTimer)
    pushTimer = null
  }
  rerun = false
  if (running) await running
}

/** 以本地为准：本地全部记录标记为最新并上传，云端多出来的记成删除 */
export async function replaceRemoteWithLocal(sb: CloudClient): Promise<void> {
  await flushSave().catch(() => {})
  const remoteTypes = await listRemoteAliveTypes(sb)
  const now = Date.now()
  const db = getDb()
  const remoteSet = new Set(remoteTypes)
  await db.transaction('rw', allRecordTables(), async () => {
    for (const name of SYNCED_TABLES) {
      const table = recordTable(name)
      const prefix = `${REMOTE_PREFIX}${name}:`
      const rows = await table.toArray()
      const alive = rows.filter(r => !r.del)
      if (alive.length) await table.bulkPut(alive.map(r => ({ ...r, t: now, dirty: 1 as const })))
      // 云端本来就没有（或已删除）的记录，不用再传“已删除”
      const pointless = rows.filter(r => r.del && !remoteSet.has(prefix + r.key)).map(r => r.key)
      if (pointless.length) await table.bulkDelete(pointless)
      const local = new Set(alive.map(r => r.key))
      const gone = remoteTypes
        .filter(type => type.startsWith(prefix))
        .map(type => type.slice(prefix.length))
        .filter(key => !local.has(key))
      if (gone.length) {
        await table.bulkPut(gone.map(key => ({ key, v: null, h: '', t: now, dirty: 1 as const, del: 1 as const })))
      }
    }
  })
  await pushDirty(sb)
  await setMeta(CURSOR_KEY, Date.now())
}

/**
 * 以云端为准：清空本地记录后整份拉取并读入界面。
 * 云端还没有分表数据（只有旧版整块数据）时返回 false，由调用方按旧格式处理。
 */
export async function replaceLocalWithRemote(sb: CloudClient): Promise<boolean> {
  // Finish all network reads before changing local data. A failed download cannot erase the cache.
  const remote: RemoteRow[] = []
  let after: string | undefined
  do {
    const page = await sb.list({ prefix: REMOTE_PREFIX, after, limit: PAGE })
    remote.push(...page.rows)
    after = page.next || undefined
  } while (after)
  if (!remote.length) return false
  if (remote.some(row => (row.data_version ?? 0) > RECORD_SYNC_VERSION)) throw new Error('cloud_unavailable')
  await withPersistenceLock(async () => {
    const db = getDb()
    await db.transaction('rw', [...allRecordTables(), db.meta], async () => {
      for (const table of allRecordTables()) await table.clear()
      await db.meta.delete(CURSOR_KEY)
      await db.meta.delete(FULL_CHECK_KEY)
      await applyRemoteRows(remote)
    })
    await reloadNow(false)
  })
  await applyCloudExtras()
  await ensureStudyContentLoaded()
  return true
}
