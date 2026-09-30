import { shallowReactive, toRaw, watch } from 'vue'
import { get } from 'idb-keyval'
import { Toast } from '@/base'
import { type BaseState, getDefaultBaseState, useBaseStore } from '../stores/base'
import { SAVE_DICT_KEY } from '../config/env'
import { _getDictDataByUrl, checkAndUpgradeSaveDict, isSameDictResource, normalizeStoredDict } from '../utils'
import { DictType } from '../types/enum'
import { saveHashSnapshot } from '../composables/useDataSyncPersistence'
import {
  type AllRows,
  allRecordTables,
  getDb,
  getMeta,
  readAllRows,
  recordTable,
  type StoredRow,
  SYNCED_TABLES,
} from './db'
import {
  assembleState,
  type Baseline,
  buildBaseline,
  type Changes,
  collectHashes,
  diffState,
  emptyBaseline,
  hasAnyRecord,
  latestRecordTime,
  walkState,
} from './records'
import { isSyncConfigured, schedulePush } from './record-sync'
import { cloudState } from '../utils/cloud'

/**
 * 学习数据（词典、进度、学习记录、复习卡片、笔记）的读写。
 *
 * - 读：启动时从分表拼出 BaseState；第一次运行新版本时先把旧的整块数据迁移过来。
 * - 写：store 有改动 → 800ms 后（连续改动最多等 4 秒）和基线比较，只写变了的记录。
 *   保存串行执行、不会被跳过；写失败会提示并自动重试；页面切到后台或关闭时立刻保存。
 */

const MIGRATION_KEY = 'migration'
const SAVE_DELAY = 800
const SAVE_MAX_WAIT = 4000
const RETRY_DELAY = 3000
const PERSIST_ASKED_KEY = 'fw-persist-asked'

let baseline: Baseline | null = null
let chain: Promise<unknown> = Promise.resolve()
let queued: Promise<void> | null = null
let queuedDeep = false
let timer: ReturnType<typeof setTimeout> | null = null
let firstScheduledAt = 0
let lastErrorToastAt = 0

/** 串行执行：保存、重新读取、整体替换不会互相穿插 */
export function withPersistenceLock<T>(job: () => Promise<T>): Promise<T> {
  const run = chain.then(() => job())
  chain = run.catch(() => {})
  return run
}

// ─────────────────────────── 写入 ───────────────────────────

function toRow(key: string, v: unknown, h: string, t: number, dirty: 0 | 1, dict?: string): StoredRow {
  const row: StoredRow = { key, v, h, t, dirty }
  if (dict) row.dict = dict
  return row
}

/** 删除记录：开了云同步时留一条“已删除”，把删除同步到其他设备 */
export function tombstone(key: string, t: number, dict?: string): StoredRow {
  const row: StoredRow = { key, v: null, h: '', t, dirty: 1, del: 1 }
  if (dict) row.dict = dict
  return row
}

/** 必须在 Dexie 事务里调用（事务里只能等 Dexie 自己的操作） */
async function writeChanges(ch: Changes, t: number, opts: { dirty: 0 | 1; tombstones: boolean }) {
  for (const name of SYNCED_TABLES) {
    const table = recordTable(name)
    const puts = ch.puts[name]
    if (puts.length) await table.bulkPut(puts.map(p => toRow(p.key, p.v, p.h, t, opts.dirty, p.dict)))
    const dels = ch.dels[name]
    if (!dels.length) continue
    if (opts.tombstones) await table.bulkPut(dels.map(d => tombstone(d.key, t, d.dict)))
    else await table.bulkDelete(dels.map(d => d.key))
  }
}

async function savePass(deep: boolean): Promise<void> {
  if (cloudState.paused) return
  if (!baseline) return
  const store = useBaseStore()
  const ch = diffState(walkState(store.$state), baseline, { deep })
  if (ch.count) {
    const configured = isSyncConfigured()
    await getDb().transaction('rw', allRecordTables(), () =>
      writeChanges(ch, Date.now(), { dirty: configured ? 1 : 0, tombstones: configured })
    )
    announceWrite()
    if (configured) schedulePush()
  }
  ch.commit()
}

function reportSaveError(e: unknown) {
  console.error('[persist] 学习数据保存失败', e)
  const now = Date.now()
  if (now - lastErrorToastAt < 60_000) return
  lastErrorToastAt = now
  try {
    Toast.error('学习数据保存失败，稍后会自动重试')
  } catch {
    /* 界面还没准备好 */
  }
}

/** 有改动：稍后保存（连续改动时最多等 SAVE_MAX_WAIT） */
export function scheduleSave(delay = SAVE_DELAY): void {
  const now = Date.now()
  if (!firstScheduledAt) firstScheduledAt = now
  if (timer) clearTimeout(timer)
  const wait = Math.max(0, Math.min(delay, firstScheduledAt + SAVE_MAX_WAIT - now))
  timer = setTimeout(() => {
    timer = null
    flushSave().catch(() => {})
  }, wait)
}

/**
 * 立即保存。deep=true 时逐条比较内容（离开页面时用，兜住原地改对象属性这类改动）。
 * 前一次保存还没结束时会排在它后面，并合并成一次。
 */
export function flushSave(opts: { deep?: boolean } = {}): Promise<void> {
  if (timer) {
    clearTimeout(timer)
    timer = null
  }
  firstScheduledAt = 0
  if (opts.deep) queuedDeep = true
  if (queued) return queued
  const job = withPersistenceLock(async () => {
    queued = null
    const deep = queuedDeep
    queuedDeep = false
    try {
      await savePass(deep)
    } catch (e) {
      reportSaveError(e)
      scheduleSave(RETRY_DELAY)
      throw e
    }
  })
  queued = job
  return job
}

// ─────────────────────────── 读取与迁移 ───────────────────────────

/** 旧版整块数据的 updated_at 写在字符串末尾：只看结尾，不解析整个大 JSON */
function legacyUpdatedAt(raw: unknown): number {
  let value: string | undefined
  if (typeof raw === 'string') value = raw.slice(-160).match(/"updated_at":"([^"]+)"/)?.[1]
  else value = (raw as any)?.updated_at
  const t = Date.parse(value ?? '')
  return Number.isFinite(t) ? t : 0
}

async function readLegacy(): Promise<{ state: BaseState; t: number } | null> {
  const raw = await get(SAVE_DICT_KEY.key)
  if (!raw) return null
  const state = (await checkAndUpgradeSaveDict(raw)) as BaseState
  return { state, t: legacyUpdatedAt(raw) || Date.now() }
}

/**
 * 第一次运行新版本：把旧的整块数据（idb-keyval 的 typing-word-dict）拆成分表记录。
 * 旧数据原样保留不删；迁移前在“设置 → 数据 → 历史数据”里留一份快照。
 */
async function migrateIfNeeded(): Promise<void> {
  const db = getDb()
  if (await getMeta(MIGRATION_KEY)) return
  const legacy = await readLegacy()
  if (legacy) {
    try {
      await saveHashSnapshot('分表存储迁移前-自动备份', '')
    } catch (e) {
      console.warn('[persist] 迁移前快照失败', e)
    }
  }
  const ch = legacy ? diffState(walkState(legacy.state), emptyBaseline(), { deep: true }) : null
  const dirty = isSyncConfigured() ? 1 : 0
  await db.transaction('rw', [...allRecordTables(), db.meta], async () => {
    if (await db.meta.get(MIGRATION_KEY)) return // 另一个标签页已经迁移完了
    for (const table of allRecordTables()) await table.clear() // 上次迁移中途失败留下的半截数据
    if (ch && legacy) await writeChanges(ch, legacy.t, { dirty, tombstones: false })
    await db.meta.put({
      key: MIGRATION_KEY,
      v: { version: 1, at: Date.now(), legacyUpdatedAt: legacy?.t ?? null, records: ch?.count ?? 0 },
    })
  })
}

/**
 * 迁移之后旧版本又写过旧数据（切回过旧版代码）：把旧版这段时间的数据并进来。
 * 旧版那份比库里任何记录都新才合并；按“较新优先”覆盖同一条记录，不删除任何记录。
 */
async function mergeLegacyIfNewer(rows: AllRows): Promise<boolean> {
  const info = await getMeta(MIGRATION_KEY)
  const raw = info ? await get(SAVE_DICT_KEY.key) : null
  if (!raw) return false
  const t = legacyUpdatedAt(raw)
  if (!t || t <= (info.legacyUpdatedAt ?? 0) || t <= latestRecordTime(rows)) return false
  try {
    await saveHashSnapshot('合并旧版数据前-自动备份', '')
  } catch (e) {
    console.warn('[persist] 合并前快照失败', e)
  }
  const state = (await checkAndUpgradeSaveDict(raw)) as BaseState
  const ch = diffState(walkState(state), emptyBaseline(), { deep: true })
  const db = getDb()
  await db.transaction('rw', [...allRecordTables(), db.meta], async () => {
    await writeChanges(ch, t, { dirty: isSyncConfigured() ? 1 : 0, tombstones: false })
    await db.meta.put({ key: MIGRATION_KEY, v: { ...info, legacyUpdatedAt: t, mergedAt: Date.now() } })
  })
  return true
}

/** 没开同步时，删除记录不需要留着 */
async function purgeTombstones(rows: AllRows) {
  const work = SYNCED_TABLES.map(name => [name, rows[name].filter(r => r.del).map(r => r.key)] as const).filter(
    ([, keys]) => keys.length
  )
  if (!work.length) return
  await getDb().transaction('rw', allRecordTables(), async () => {
    for (const [name, keys] of work) await recordTable(name).bulkDelete(keys)
  })
}

function assemble(rows: AllRows): BaseState {
  return assembleState(rows, getDefaultBaseState(), normalizeStoredDict) as BaseState
}

/** 启动时读取（必要时先迁移）。库里一条数据都没有时返回 null，用默认状态 */
export async function loadState(): Promise<{ state: BaseState; hashes: Map<string, string> } | null> {
  getChannel()
  await migrateIfNeeded()
  let rows = await readAllRows()
  if (await mergeLegacyIfNewer(rows)) rows = await readAllRows()
  if (!isSyncConfigured()) purgeTombstones(rows).catch(e => console.warn('[persist] 清理删除记录失败', e))
  if (!hasAnyRecord(rows)) return null
  return { state: assemble(rows), hashes: collectHashes(rows) }
}

/** 以当前 store 内容为基线（刚读出来 / 刚整体写入之后） */
export function adoptState(stateLike: BaseState, hashes?: Map<string, string>): void {
  baseline = buildBaseline(walkState(stateLike), hashes)
}

/** 内置词库的单词 / 文章不存库，重新读取时沿用内存里已经下载好的 */
function carryOverLoadedContent(next: BaseState, prev: BaseState) {
  for (const kind of ['word', 'article'] as const) {
    const field = kind === 'word' ? 'words' : 'articles'
    const prevList = toRaw(toRaw(prev)[kind].bookList) as any[]
    for (const d of next[kind].bookList as any[]) {
      if (d.custom || d.system || d[field]?.length) continue
      const old = prevList.map(v => toRaw(v)).find(o => !o.custom && !o.system && o[field]?.length && isSameDictResource(o, d))
      if (old) d[field] = old[field]
    }
  }
}

/** 正在学的是内置词库、单词还没下载时补下载（和旧版远端拉取后的处理一致） */
export async function ensureStudyContentLoaded(): Promise<void> {
  const store = useBaseStore()
  try {
    const d = store.sdict
    if (store.word.studyIndex >= 3 && !d.custom && !d.system && !d.words.length && d.url) {
      const r = await _getDictDataByUrl(d)
      if (r.words.length) store.word.bookList[store.word.studyIndex].words = shallowReactive(r.words)
    }
    const b = store.sbook
    if (store.article.studyIndex >= 1 && !b.custom && !b.system && !b.articles.length && b.url) {
      const r = await _getDictDataByUrl(b, DictType.article)
      if (r.articles.length) store.article.bookList[store.article.studyIndex].articles = shallowReactive(r.articles)
    }
  } catch (e) {
    console.warn('[persist] 下载词库内容失败', e)
  }
}

/** 调用方需已持有锁。save=true 时先存下本页还没存的改动（本机改动更新，优先保留） */
export async function reloadNow(save: boolean): Promise<void> {
  const store = useBaseStore()
  if (save) await savePass(false)
  const rows = await readAllRows()
  const state = assemble(rows)
  carryOverLoadedContent(state, store.$state)
  state.load = store.load
  store.setState(state)
  adoptState(store.$state, collectHashes(rows))
}

/** 库被别处改过（云端拉取、其他标签页）后重新读取 */
export function reloadFromDb(): Promise<void> {
  return withPersistenceLock(() => reloadNow(true)).then(() => ensureStudyContentLoaded())
}

/**
 * 整体替换（导入、恢复历史、清空、以云端旧格式数据为准）：写完即以它为基线。
 * 调用方随后用同一个对象 setState，不会再触发写入。
 */
export function replaceAllData(stateLike: BaseState, opts: { t?: number } = {}): Promise<void> {
  return withPersistenceLock(async () => {
    const db = getDb()
    const fresh = emptyBaseline()
    const ch = diffState(walkState(stateLike), fresh, { deep: true })
    const t = opts.t ?? Date.now()
    const configured = isSyncConfigured()
    await db.transaction('rw', [...allRecordTables(), db.meta], async () => {
      for (const name of SYNCED_TABLES) {
        const table = recordTable(name)
        if (configured) {
          // 开了同步：原来有、新数据里没有的记录，以“已删除”同步出去
          const keep = new Set(ch.puts[name].map(p => p.key))
          const oldKeys = (await table.toCollection().primaryKeys()) as string[]
          await table.clear()
          const gone = oldKeys.filter(k => !keep.has(k))
          if (gone.length) await table.bulkPut(gone.map(k => tombstone(k, t)))
        } else {
          await table.clear()
        }
      }
      await writeChanges(ch, t, { dirty: configured ? 1 : 0, tombstones: false })
      const info = (await db.meta.get(MIGRATION_KEY))?.v
      await db.meta.put({ key: MIGRATION_KEY, v: { version: 1, at: Date.now(), ...info, replacedAt: Date.now() } })
    })
    ch.commit()
    baseline = fresh
    announceWrite()
    if (configured) schedulePush()
  })
}

/** 给“历史数据”快照用：当前全部学习数据，旧版整块格式的 JSON 字符串 */
export async function getDictSnapshotJson(): Promise<string | null> {
  try {
    if (await getMeta(MIGRATION_KEY)) {
      const rows = await readAllRows()
      if (!hasAnyRecord(rows)) return null
      const updated_at = new Date(latestRecordTime(rows) || Date.now()).toISOString()
      return JSON.stringify({ val: assemble(rows), version: SAVE_DICT_KEY.version, updated_at })
    }
  } catch (e) {
    console.warn('[persist] 读取分表数据做快照失败，改用旧数据', e)
  }
  const raw = await get(SAVE_DICT_KEY.key)
  if (raw == null) return null
  return typeof raw === 'string' ? raw : JSON.stringify(raw)
}

// ─────────────────────────── 监听改动 ───────────────────────────

const HEAVY_FIELDS = new Set(['words', 'articles', 'statistics'])

/**
 * 只“摸”一遍会被保存的结构：数组摸到每一项（不进到每个单词内部），小字段整个读一遍。
 * Pinia 的 $subscribe 是深度监听，每次改动都要把几千个词条连同里面的例句全部遍历一遍；这里便宜得多。
 */
function touchState(s: any) {
  for (const w of s.simpleWords) void w
  void s.word.studyIndex
  void s.article.studyIndex
  void s.dictListVersion
  for (const list of [s.word.bookList, s.article.bookList]) {
    for (const d of list) {
      for (const k in d) {
        const v = d[k]
        if (HEAVY_FIELDS.has(k)) {
          if (v) for (const x of v) void x
        } else if (v && typeof v === 'object') {
          JSON.stringify(v)
        }
      }
    }
  }
  for (const k in s.fsrsData) void s.fsrsData[k]
  for (const k in s.noteData) void s.noteData[k]
}

/** store 有改动就安排保存；返回停止监听的函数 */
export function watchStoreChanges(): () => void {
  const store = useBaseStore()
  getChannel()
  let runs = 0
  return watch(
    () => {
      touchState(store.$state)
      return ++runs
    },
    () => scheduleSave()
  )
}

// ─────────────────────────── 多标签页 ───────────────────────────

const TAB_ID = Math.random().toString(36).slice(2)
let channel: BroadcastChannel | null | undefined
let otherTabWrote = false

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel
  try {
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel('fengwords-data')
    if (channel) {
      channel.onmessage = e => {
        if (e.data?.tab !== TAB_ID) otherTabWrote = true
      }
    }
  } catch {
    channel = null
  }
  return channel
}

function announceWrite() {
  try {
    getChannel()?.postMessage({ tab: TAB_ID, at: Date.now() })
  } catch {
    /* 忽略 */
  }
}

/** 别的标签页写过数据吗（读一次就清零）：切回本页时据此重新读取 */
export function consumeOtherTabWrites(): boolean {
  const v = otherTabWrote
  otherTabWrote = false
  return v
}

// ─────────────────────────── 持久存储 ───────────────────────────

/**
 * 申请“持久存储”，降低浏览器在空间紧张或长时间未访问时清掉本地数据的概率。
 * 有学习数据后才申请；Firefox 会弹窗询问，所以一周最多问一次。
 */
export async function requestPersistentStorage(): Promise<void> {
  try {
    const storage = navigator.storage
    if (!storage?.persist || !storage.persisted) return
    if (await storage.persisted()) return
    const store = useBaseStore()
    const hasData = store.word.bookList.some(
      d => d.statistics?.length || ((d.custom || d.system) && d.words?.length)
    )
    if (!hasData) return
    const last = Number(localStorage.getItem(PERSIST_ASKED_KEY)) || 0
    if (Date.now() - last < 7 * 24 * 3600 * 1000) return
    localStorage.setItem(PERSIST_ASKED_KEY, String(Date.now()))
    await storage.persist()
  } catch {
    /* 不支持就算了 */
  }
}
