import Dexie, { type Table } from 'dexie'

/**
 * 学习数据的本地数据库（IndexedDB，经 Dexie）。
 *
 * 以前所有学习数据是一个大 JSON（idb-keyval 的 `typing-word-dict`），改一点就整块重写。
 * 现在按种类分表、按条存，只写变了的那几条：
 *
 * | 表      | 一条记录                               | key                                  |
 * |---------|----------------------------------------|--------------------------------------|
 * | state   | 正在学的词典、常见词表等                 | 'state'                              |
 * | dicts   | 一本词典的信息 + 学习进度                | 'word:<id>' / 'article:<id>'         |
 * | orders  | 一本词典里词条的顺序                     | 同词典 key                            |
 * | entries | 一个词条（自定义词典 / 收藏 / 错词 / 已掌握 / 自定义文章） | '<词典 key>|<单词或文章 id>' |
 * | stats   | 一次学习记录                             | 记录 id                               |
 * | fsrs    | 一张 FSRS 复习卡片                       | 单词                                  |
 * | notes   | 一条单词笔记                             | 单词                                  |
 * | meta    | 本机状态（迁移标记、同步游标），不同步     | 名称                                  |
 *
 * 每条记录：v 内容、h 内容指纹、t 最后修改时间（毫秒）、dirty 待上传云端、del 已删除
 * （只在配置了云同步时保留删除记录，好把删除同步到其他设备）。
 */

export type SyncedTable = 'state' | 'dicts' | 'orders' | 'entries' | 'stats' | 'fsrs' | 'notes'

export const SYNCED_TABLES: SyncedTable[] = ['state', 'dicts', 'orders', 'entries', 'stats', 'fsrs', 'notes']

export interface StoredRow<T = any> {
  key: string
  v: T | null
  /** 内容指纹；从云端拉下来的记录为空串，加载时再算 */
  h: string
  t: number
  dirty: 0 | 1
  del?: 1
  /** entries / stats：所属词典 key */
  dict?: string
}

export interface MetaRow {
  key: string
  v: any
}

// 表名不能叫 core：那是 Dexie 自己的属性。字段用 declare，只声明类型，不生成会覆盖 Dexie 赋值的类字段
class FengWordsDB extends Dexie {
  declare state: Table<StoredRow, string>
  declare dicts: Table<StoredRow, string>
  declare orders: Table<StoredRow, string>
  declare entries: Table<StoredRow, string>
  declare stats: Table<StoredRow, string>
  declare fsrs: Table<StoredRow, string>
  declare notes: Table<StoredRow, string>
  declare meta: Table<MetaRow, string>

  constructor() {
    super('fengwords')
    this.version(1).stores({
      state: 'key, dirty',
      dicts: 'key, dirty',
      orders: 'key, dirty',
      entries: 'key, dict, dirty',
      stats: 'key, dict, dirty',
      fsrs: 'key, dirty',
      notes: 'key, dirty',
      meta: 'key',
    })
  }
}

let db: FengWordsDB | null = null

export function getDb(): FengWordsDB {
  if (!db) db = new FengWordsDB()
  return db
}

export function recordTable(name: SyncedTable): Table<StoredRow, string> {
  return getDb()[name]
}

export function allRecordTables(): Table<StoredRow, string>[] {
  return SYNCED_TABLES.map(recordTable)
}

export type AllRows = Record<SyncedTable, StoredRow[]>

export async function readAllRows(): Promise<AllRows> {
  const out = {} as AllRows
  await getDb().transaction('r', allRecordTables(), async () => {
    for (const name of SYNCED_TABLES) out[name] = await recordTable(name).toArray()
  })
  return out
}

export async function getMeta<T = any>(key: string): Promise<T | undefined> {
  return (await getDb().meta.get(key))?.v
}

export async function setMeta(key: string, v: unknown): Promise<void> {
  await getDb().meta.put({ key, v })
}
