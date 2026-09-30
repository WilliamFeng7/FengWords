import { toRaw } from 'vue'
import { nanoid } from 'nanoid'
import { hashString } from './hash'
import { SYNCED_TABLES, type AllRows, type StoredRow, type SyncedTable } from './db'

/**
 * 内存里的 BaseState ⇄ 分表记录。
 *
 * 界面仍然只读写 Pinia 里的 BaseState；这里负责把它拆成一条条记录，
 * 并和“上次存下来的样子”（基线）比较，只挑出变了的记录去写。
 * 这个文件不碰数据库，也不依赖 store，方便单独测试。
 */

export type DictKind = 'word' | 'article'

export const CORE_KEY = 'state'

const WORD_KNOWN = 'wordKnown'
const SYSTEM_DICT_IDS: Record<DictKind, string[]> = {
  word: ['wordCollect', 'wordWrong', WORD_KNOWN],
  article: ['articleCollect'],
}

export interface CoreRecord {
  simpleWords: string[]
  dictListVersion: number
  /** 存词典 key 而不是下标：多设备合并后词典顺序可能不同，下标会指错 */
  wordStudyKey: string | null
  articleStudyKey: string | null
}

export interface LiveDict {
  key: string
  kind: DictKind
  raw: any
  metaJson: string
  /** 只有自定义 / 系统词典单独存词条；内置词库的单词不存，用到时再下载 */
  entryIds: string[] | null
  entries: any[] | null
  stats: Array<{ key: string; obj: any }>
}

export interface LiveState {
  core: CoreRecord
  coreJson: string
  dicts: LiveDict[]
  fsrs: Record<string, any>
  notes: Record<string, any>
}

interface RefHash {
  ref: object
  h: string
  dict?: string
}

/** 上次写入后每条记录的样子：对象引用（快速判断）+ 内容指纹（确认） */
export interface Baseline {
  core: string | null
  dicts: Map<string, { json: string; raw: object }>
  orders: Map<string, string[]>
  entries: Map<string, RefHash>
  stats: Map<string, RefHash>
  fsrs: Map<string, RefHash>
  notes: Map<string, string>
}

export interface RecordPut {
  key: string
  v: unknown
  h: string
  dict?: string
}

export interface RecordDel {
  key: string
  dict?: string
}

export interface Changes {
  puts: Record<SyncedTable, RecordPut[]>
  dels: Record<SyncedTable, RecordDel[]>
  count: number
  /** 写入成功后再更新基线；写失败时基线不动，下次会重新比较、重试 */
  commit: () => void
}

export const emptyBaseline = (): Baseline => ({
  core: null,
  dicts: new Map(),
  orders: new Map(),
  entries: new Map(),
  stats: new Map(),
  fsrs: new Map(),
  notes: new Map(),
})

export const isKnownDict = (d: any) => !!d && (d.id === WORD_KNOWN || d.enName === WORD_KNOWN)

/** 已掌握只用来过滤和列表展示：只留拼写、音标和释义（完整词条约 1.2KB，这样约 100 字节） */
export function slimKnownWord(w: any) {
  return {
    word: w?.word ?? '',
    phonetic0: w?.phonetic0 ?? '',
    phonetic1: w?.phonetic1 ?? '',
    trans: Array.isArray(w?.trans) ? w.trans : [],
  }
}

/** 瘦身后的词条补齐默认字段，界面按完整词条用也不会出错 */
function withWordDefaults(v: any) {
  return {
    custom: false,
    word: '',
    phonetic0: '',
    phonetic1: '',
    trans: [],
    sentences: [],
    phrases: [],
    synos: [],
    relWords: { root: '', rels: [] },
    etymology: [],
    ...v,
  }
}

/** 一个词条实际要存的内容 */
export function entryPayload(kind: DictKind, known: boolean, item: any) {
  if (kind === 'article') return { ...item, sections: [] } // 句子切分运行时再生成
  return known ? slimKnownWord(item) : item
}

export const statHash = (dictKey: string, json: string) => hashString(dictKey + '\n' + json)

function uniqueKey(base: string, used: Set<string>): string {
  let key = base
  for (let n = 2; used.has(key); n++) key = `${base}#${n}`
  used.add(key)
  return key
}

function dictBaseId(d: any, index: number): string {
  const id = d.id
  if (id !== undefined && id !== null && id !== '') return String(id)
  return String(d.enName || d.name || `_${index}`)
}

function ensureArticleId(a: any): string {
  if (a.id === undefined || a.id === null || a.id === '') a.id = nanoid(8)
  return String(a.id)
}

/** 学习记录 id 由内容决定：两台设备迁移同一份旧数据，会得到同样的 id，不会重复 */
function statContentId(dictKey: string, s: any): string {
  return (
    's_' +
    hashString(
      [dictKey, s.startDate, s.spend, s.total, s.new, s.review, s.wrong, s.sessionRole ?? '', s.title ?? ''].join('|')
    )
  )
}

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((v, i) => v === b[i])

/** 把内存状态展开成一条条记录（不深拷贝；缺 id 的学习记录 / 文章会顺手补上 id） */
export function walkState(stateLike: any): LiveState {
  const state = toRaw(stateLike)
  const dicts: LiveDict[] = []
  const usedDictKeys = new Set<string>()
  const usedStatKeys = new Set<string>()
  const studyKeys: Record<DictKind, string | null> = { word: null, article: null }

  for (const kind of ['word', 'article'] as DictKind[]) {
    const group = toRaw(state?.[kind])
    const list: any[] = toRaw(group?.bookList) ?? []
    for (let i = 0; i < list.length; i++) {
      const dict = toRaw(list[i])
      if (!dict || typeof dict !== 'object') continue
      const key = uniqueKey(`${kind}:${dictBaseId(dict, i)}`, usedDictKeys)
      if (i === group.studyIndex) studyKeys[kind] = key

      const { words, articles, statistics, ...meta } = dict
      const metaJson = JSON.stringify({ ...meta, kind, o: i })

      let entryIds: string[] | null = null
      let entries: any[] | null = null
      if (dict.custom || dict.system) {
        entryIds = []
        entries = []
        const used = new Set<string>()
        const items: any[] = toRaw(kind === 'word' ? words : articles) ?? []
        for (const item0 of items) {
          const item = toRaw(item0)
          if (!item || typeof item !== 'object') continue
          const id = kind === 'word' ? String(item.word ?? '') : ensureArticleId(item)
          entryIds.push(uniqueKey(id, used))
          entries.push(item)
        }
      }

      const stats: LiveDict['stats'] = []
      for (const s0 of toRaw(statistics) ?? []) {
        const s = toRaw(s0)
        if (!s || typeof s !== 'object') continue
        if (!s.id) s.id = statContentId(key, s)
        stats.push({ key: uniqueKey(String(s.id), usedStatKeys), obj: s })
      }

      dicts.push({ key, kind, raw: dict, metaJson, entryIds, entries, stats })
    }
  }

  const core: CoreRecord = {
    simpleWords: [...(toRaw(state?.simpleWords) ?? [])],
    dictListVersion: state?.dictListVersion ?? 1,
    wordStudyKey: studyKeys.word,
    articleStudyKey: studyKeys.article,
  }
  return {
    core,
    coreJson: JSON.stringify(core),
    dicts,
    fsrs: toRaw(state?.fsrsData) ?? {},
    notes: toRaw(state?.noteData) ?? {},
  }
}

/**
 * 找出和基线相比变了的记录。
 * 词条、学习记录、复习卡片先比对象引用（没换对象就当没变，很便宜），换了对象再比内容指纹；
 * deep=true 时不看引用、逐条比内容，用来兜住“原地修改对象属性”这类改动（离开页面时做一次）。
 */
export function diffState(live: LiveState, base: Baseline, opts: { deep?: boolean } = {}): Changes {
  const puts = {} as Changes['puts']
  const dels = {} as Changes['dels']
  for (const t of SYNCED_TABLES) {
    puts[t] = []
    dels[t] = []
  }
  const updates: Array<() => void> = []
  let count = 0
  const put = (t: SyncedTable, p: RecordPut) => {
    puts[t].push(p)
    count++
  }
  const del = (t: SyncedTable, d: RecordDel) => {
    dels[t].push(d)
    count++
  }

  if (live.coreJson !== base.core) {
    put('state', { key: CORE_KEY, v: JSON.parse(live.coreJson), h: hashString(live.coreJson) })
    updates.push(() => (base.core = live.coreJson))
  }

  const seenDicts = new Set<string>()
  const seenEntries = new Set<string>()
  const seenStats = new Set<string>()

  for (const d of live.dicts) {
    seenDicts.add(d.key)
    const bd = base.dicts.get(d.key)
    const replaced = !bd || bd.raw !== d.raw
    if (!bd || bd.json !== d.metaJson) put('dicts', { key: d.key, v: JSON.parse(d.metaJson), h: hashString(d.metaJson) })
    if (!bd || bd.json !== d.metaJson || replaced) updates.push(() => base.dicts.set(d.key, { json: d.metaJson, raw: d.raw }))

    if (d.entryIds && d.entries) {
      const prev = base.orders.get(d.key)
      if (!prev || !sameList(prev, d.entryIds)) {
        const ids = d.entryIds.slice()
        put('orders', { key: d.key, v: ids, h: hashString(ids.join('\n')) })
        updates.push(() => base.orders.set(d.key, ids))
      }
      const known = d.kind === 'word' && isKnownDict(d.raw)
      // 词典对象整个被换掉（编辑器改完词会这样做）、或是文章：逐条比内容
      const compareAll = opts.deep || replaced || d.kind === 'article'
      for (let i = 0; i < d.entryIds.length; i++) {
        const key = `${d.key}|${d.entryIds[i]}`
        const obj = d.entries[i]
        seenEntries.add(key)
        const be = base.entries.get(key)
        if (be && be.ref === obj && !compareAll) continue
        const json = JSON.stringify(entryPayload(d.kind, known, obj))
        const h = hashString(json)
        if (!be || be.h !== h) put('entries', { key, v: JSON.parse(json), h, dict: d.key })
        updates.push(() => base.entries.set(key, { ref: obj, h, dict: d.key }))
      }
    } else if (base.orders.has(d.key)) {
      del('orders', { key: d.key })
      updates.push(() => base.orders.delete(d.key))
    }

    for (const { key, obj } of d.stats) {
      seenStats.add(key)
      const bs = base.stats.get(key)
      if (bs && bs.ref === obj && bs.dict === d.key && !opts.deep) continue
      const json = JSON.stringify(obj)
      const h = statHash(d.key, json)
      if (!bs || bs.h !== h) put('stats', { key, v: JSON.parse(json), h, dict: d.key })
      updates.push(() => base.stats.set(key, { ref: obj, h, dict: d.key }))
    }
  }

  for (const key of base.dicts.keys()) {
    if (seenDicts.has(key)) continue
    del('dicts', { key })
    updates.push(() => base.dicts.delete(key))
  }
  for (const key of base.orders.keys()) {
    if (seenDicts.has(key)) continue
    del('orders', { key })
    updates.push(() => base.orders.delete(key))
  }
  for (const [key, be] of base.entries) {
    if (seenEntries.has(key)) continue
    del('entries', { key, dict: be.dict })
    updates.push(() => base.entries.delete(key))
  }
  for (const [key, bs] of base.stats) {
    if (seenStats.has(key)) continue
    del('stats', { key, dict: bs.dict })
    updates.push(() => base.stats.delete(key))
  }

  const fsrs = live.fsrs
  for (const word in fsrs) {
    const card = toRaw(fsrs[word])
    if (!card || typeof card !== 'object') continue
    const bf = base.fsrs.get(word)
    if (bf && bf.ref === card && !opts.deep) continue
    const json = JSON.stringify(card)
    const h = hashString(json)
    if (!bf || bf.h !== h) put('fsrs', { key: word, v: JSON.parse(json), h })
    updates.push(() => base.fsrs.set(word, { ref: card, h }))
  }
  for (const word of base.fsrs.keys()) {
    const card = fsrs[word]
    if (card && typeof card === 'object') continue
    del('fsrs', { key: word })
    updates.push(() => base.fsrs.delete(word))
  }

  const notes = live.notes
  for (const word in notes) {
    const note = notes[word]
    if (typeof note !== 'string' || base.notes.get(word) === note) continue
    put('notes', { key: word, v: note, h: hashString(note) })
    updates.push(() => base.notes.set(word, note))
  }
  for (const word of base.notes.keys()) {
    if (typeof notes[word] === 'string') continue
    del('notes', { key: word })
    updates.push(() => base.notes.delete(word))
  }

  return {
    puts,
    dels,
    count,
    commit: () => {
      for (const f of updates) f()
    },
  }
}

/**
 * 以当前状态为基线（刚从库里读出来时用）。
 * known 是库里记录的指纹（`表\0key` → h）；没有指纹的（从云端拉下来的）现算一次。
 */
export function buildBaseline(live: LiveState, known?: Map<string, string>): Baseline {
  const b = emptyBaseline()
  b.core = live.coreJson
  for (const d of live.dicts) {
    b.dicts.set(d.key, { json: d.metaJson, raw: d.raw })
    if (d.entryIds && d.entries) {
      b.orders.set(d.key, d.entryIds.slice())
      const knownDict = d.kind === 'word' && isKnownDict(d.raw)
      for (let i = 0; i < d.entryIds.length; i++) {
        const key = `${d.key}|${d.entryIds[i]}`
        const obj = d.entries[i]
        const h = known?.get('entries\u0000' + key) || hashString(JSON.stringify(entryPayload(d.kind, knownDict, obj)))
        b.entries.set(key, { ref: obj, h, dict: d.key })
      }
    }
    for (const { key, obj } of d.stats) {
      const h = known?.get('stats\u0000' + key) || statHash(d.key, JSON.stringify(obj))
      b.stats.set(key, { ref: obj, h, dict: d.key })
    }
  }
  for (const word in live.fsrs) {
    const card = toRaw(live.fsrs[word])
    if (!card || typeof card !== 'object') continue
    const h = known?.get('fsrs\u0000' + word) || hashString(JSON.stringify(card))
    b.fsrs.set(word, { ref: card, h })
  }
  for (const word in live.notes) {
    if (typeof live.notes[word] === 'string') b.notes.set(word, live.notes[word])
  }
  return b
}

/** 库里记录的指纹，给 buildBaseline 用 */
export function collectHashes(rows: AllRows): Map<string, string> {
  const map = new Map<string, string>()
  for (const t of ['entries', 'stats', 'fsrs'] as SyncedTable[]) {
    for (const r of rows[t]) if (r.h && !r.del) map.set(t + '\u0000' + r.key, r.h)
  }
  return map
}

export function hasAnyRecord(rows: AllRows): boolean {
  return SYNCED_TABLES.some(t => rows[t].some(r => !r.del))
}

export function latestRecordTime(rows: AllRows): number {
  let max = 0
  for (const t of SYNCED_TABLES) for (const r of rows[t]) if (r.t > max) max = r.t
  return max
}

/**
 * 从分表记录拼回 BaseState。
 * defaults：一份默认状态（缺系统词典时从这里补）；normalize：和旧版读取时一样的词典规范化。
 */
export function assembleState<S extends Record<string, any>>(rows: AllRows, defaults: S, normalize: (d: any) => any): S {
  const state: any = defaults
  const alive = (t: SyncedTable) => rows[t].filter(r => !r.del && r.v !== null && r.v !== undefined)

  const core = alive('state').find(r => r.key === CORE_KEY)?.v as CoreRecord | undefined
  if (core) {
    if (Array.isArray(core.simpleWords)) state.simpleWords = core.simpleWords
    if (core.dictListVersion != null) state.dictListVersion = core.dictListVersion
  }

  const entriesByDict = new Map<string, StoredRow[]>()
  for (const r of alive('entries')) {
    if (!r.dict) continue
    let list = entriesByDict.get(r.dict)
    if (!list) entriesByDict.set(r.dict, (list = []))
    list.push(r)
  }
  const statsByDict = new Map<string, any[]>()
  for (const r of alive('stats')) {
    if (!r.dict) continue
    const s = r.v
    s.id = r.key
    let list = statsByDict.get(r.dict)
    if (!list) statsByDict.set(r.dict, (list = []))
    list.push(s)
  }
  const orderByDict = new Map<string, string[]>()
  for (const r of alive('orders')) if (Array.isArray(r.v)) orderByDict.set(r.key, r.v)

  const metas = alive('dicts').map(r => ({ key: r.key, v: r.v }))

  for (const kind of ['word', 'article'] as DictKind[]) {
    const list = metas
      .filter(m => (m.v.kind ?? 'word') === kind)
      .sort((a, b) => (a.v.o ?? 0) - (b.v.o ?? 0) || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

    const built = list.map(m => {
      const { kind: _kind, o: _o, ...meta } = m.v
      const d: any = { ...meta }
      const entryRows = entriesByDict.get(m.key)
      if (entryRows || orderByDict.has(m.key)) {
        const prefix = m.key + '|'
        const byId = new Map<string, StoredRow>()
        for (const r of entryRows ?? []) byId.set(r.key.slice(prefix.length), r)
        const items: any[] = []
        for (const id of orderByDict.get(m.key) ?? []) {
          const r = byId.get(id)
          if (!r) continue
          items.push(r.v)
          byId.delete(id)
        }
        // 别的设备新加、还没排进顺序表的词条，按修改时间接在后面
        for (const r of [...byId.values()].sort((a, b) => a.t - b.t)) items.push(r.v)
        const finalItems = kind === 'word' && isKnownDict(meta) ? items.map(withWordDefaults) : items
        if (kind === 'word') d.words = finalItems
        else d.articles = finalItems
      }
      d.statistics = (statsByDict.get(m.key) ?? []).sort((a, b) => (a.startDate ?? 0) - (b.startDate ?? 0))
      return { key: m.key, dict: normalize(d) }
    })

    // 收藏 / 错词 / 已掌握（文章收藏）固定在最前面，代码里按下标取
    const defaultsList: any[] = defaults[kind]?.bookList ?? []
    const head = SYSTEM_DICT_IDS[kind].map(id => {
      const i = built.findIndex(b => b.dict?.id === id || b.dict?.enName === id)
      if (i > -1) return built.splice(i, 1)[0]
      return { key: `${kind}:${id}`, dict: defaultsList.find(d => d.id === id) ?? normalize({ id, enName: id, system: true }) }
    })
    const all = [...head, ...built]
    const studyKey = core ? (kind === 'word' ? core.wordStudyKey : core.articleStudyKey) : null
    state[kind].bookList = all.map(b => b.dict)
    state[kind].studyIndex = studyKey ? all.findIndex(b => b.key === studyKey) : -1
  }

  state.fsrsData = Object.fromEntries(alive('fsrs').map(r => [r.key, r.v]))
  state.noteData = Object.fromEntries(alive('notes').map(r => [r.key, r.v]))
  return state as S
}
