import { get, set } from 'idb-keyval'
import { useBaseStore } from '@/core/stores/base.ts'
import type { Dict } from '@/core/types/types.ts'
import { getDefaultDict } from '@/core/types/func.ts'
import { getDictIdentityList, isSameDictResource } from '@/core/utils'
import { PRACTICE_WORD_CACHE } from '@/core/utils/cache.ts'
import { flushStatToStore } from '@/core/composables/usePracticePersistence'
import { type PracticeWordCacheCompact, usePracticeWordPersistence } from './practice-word-session.ts'

/*
 * 换词典不丢进度
 *
 * 每本词典自己的进度（学到第几个、每日目标、学习记录）本来就各自存在词典列表里；
 * 但“没练完的这一组”只有一个缓存位，以前一换词典就被清掉（或者错配到新词典上）。
 * 现在换走时把它按词典收好（本机 IndexedDB），换回来时原样放回，接着练。
 */

const PARKED_KEY = 'fw-practice-word-parked'

type ParkedSession = {
  /** 这组练习属于哪本词典（id / enName） */
  ids: string[]
  cache: PracticeWordCacheCompact
  version: number
  savedAt: number
}

async function getParkedSessions(): Promise<ParkedSession[]> {
  try {
    const list = await get(PARKED_KEY)
    return Array.isArray(list) ? list : []
  } catch (e) {
    return []
  }
}

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v))

/**
 * 从“词库资源”（词典列表、推荐）打开一本词典时，带上它在“我的词典”里已有的进度；
 * 否则会拿一份进度为 0 的新对象去覆盖已学的进度。
 */
export function withSavedProgress(val: Partial<Dict>): Dict {
  const store = useBaseStore()
  const saved = store.word.bookList.find(v => isSameDictResource(v, val as Dict))
  return getDefaultDict(saved ? { ...val, ...saved } : val)
}

/**
 * 切换当前学习的词典，并把两边“没练完的这一组”各自收好 / 放回。
 * 同一本词典（只是更新信息）时与 changeDict 完全一样。
 */
export async function switchStudyDict(next: Dict): Promise<void> {
  const store = useBaseStore()
  const current = store.sdict
  const leaving = !!current?.id && !isSameDictResource(current, next)
  if (!leaving) {
    await store.changeDict(next)
    return
  }

  const persistence = usePracticeWordPersistence()
  let parked = await getParkedSessions()

  // 1. 收好正在学的这本词典没练完的那一组
  try {
    const stored = await persistence.loadStored()
    const val = stored?.version === PRACTICE_WORD_CACHE.version ? (stored.val as PracticeWordCacheCompact | null) : null
    if (val && typeof val === 'object' && 'taskWordsStr' in val) {
      const cache = clone(val)
      const st = cache.statStoreData
      if (st) {
        // 已经花掉的时间现在就记进学习记录（只记时间；单词数等整组练完时再记，避免重复计数）
        flushStatToStore({ ...st, total: 0, newWordNumber: 0, reviewWordNumber: 0, wrong: 0 })
        cache.statStoreData = { ...st, spend: 0, segments: [], startDate: Date.now() }
      }
      const ids = getDictIdentityList(current)
      parked = parked.filter(e => !e.ids.some(id => ids.includes(id)))
      parked.push({ ids, cache, version: PRACTICE_WORD_CACHE.version, savedAt: Date.now() })
    }
  } catch (e) {
    console.warn('收起未完成的练习失败', e)
  }
  await persistence.clear()

  // 2. 切换
  await store.changeDict(next)

  // 3. 放回这本词典上次没练完的那一组
  const nextIds = getDictIdentityList(store.sdict)
  const index = parked.findIndex(e => e.ids.some(id => nextIds.includes(id)))
  if (index > -1) {
    const [entry] = parked.splice(index, 1)
    if (entry.version === PRACTICE_WORD_CACHE.version) {
      await persistence.saveCompact(entry.cache)
    }
  }
  await set(PARKED_KEY, parked)
}
