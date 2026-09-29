// 自动播种自定义词库 —— 客户端插件（支持多本词书）
// 应用把词库数据存在浏览器 IndexedDB，没有可写的后端。此插件在应用启动、本地数据(store.load)
// 加载完成后，读取下方 SEEDS 里每本词书对应的 JSON，把单词以“自定义词库”写入，含【英音/美音音标、
// 中文释义、例句】，并借助应用自带的 Pinia $subscribe 自动持久化。打开网站即见这些词书。
// 版本化：某本词书 version 变化时会用最新数据整体重建（覆盖旧的残缺版本），同版本内幂等不重复。
// 回滚：删除本文件即可；或在「词库」页删除对应词书。它不修改任何原有文件。
import { watch } from 'vue'
import { useBaseStore } from '@/core/stores/base.ts'
import { getDefaultDict } from '@/core/types/func.ts'
import { DictType } from '@/core/types/enum.ts'
import { convertToWord } from '@/core/utils'
import { nanoid } from 'nanoid'

type SeedItem = { word: string, phonetic0?: string, phonetic1?: string, trans?: string, sentences?: string }
type Seed = { name: string, url: string, version: string, ls: string }

// 要自动导入的词书清单（以后再加词表，只需往这里加一行 + 放好对应 json）
const SEEDS: Seed[] = [
  { name: 'Vocab', url: '/vocab-import.json', version: '2', ls: 'tw_seed_vocab' },
  { name: '错词·听力2', url: '/cuoci-import.json', version: '1', ls: 'tw_seed_cuoci' },
]

export default defineNuxtPlugin(nuxtApp => {
  if (import.meta.server) return

  let running = false

  async function seedOne(bookName: string, url: string, version: string, lsKey: string) {
    const store = useBaseStore()
    try {
      let stored = ''
      try {
        stored = localStorage.getItem(lsKey) || ''
      } catch {
        /* localStorage 不可用则总是重建 */
      }
      if (stored === version) return // 同版本已播种过，跳过（保留用户后续手动编辑）

      const res = await fetch(`${url}?v=${version}`, { cache: 'no-store' })
      if (!res.ok) return
      const items: SeedItem[] = await res.json()
      if (!Array.isArray(items) || !items.length) return

      // 移除同名旧词书（含残缺版），再重建；绝不动系统词库
      for (let i = store.word.bookList.length - 1; i >= 0; i--) {
        const b: any = store.word.bookList[i]
        if (b.name === bookName && !b.system) store.word.bookList.splice(i, 1)
      }
      if (store.word.studyIndex >= store.word.bookList.length) store.word.studyIndex = 0

      const book: any = getDefaultDict({
        id: 'custom-dict-' + Date.now(),
        name: bookName,
        custom: true,
        type: DictType.word,
        language: 'en',
        translateLanguage: 'zh',
      })

      const seen = new Set<string>()
      let added = 0
      for (const it of items) {
        const w = String(it?.word || '').trim()
        if (!w || seen.has(w.toLowerCase())) continue
        const word = convertToWord({
          id: nanoid(6),
          word: w,
          phonetic0: String(it?.phonetic0 || ''),
          phonetic1: String(it?.phonetic1 || ''),
          trans: String(it?.trans || ''),
          sentences: String(it?.sentences || ''),
        })
        word.custom = true
        book.words.push(word)
        seen.add(w.toLowerCase())
        added++
      }
      if (!added) return

      book.length = book.words.length
      book.perDayStudyNumber = Math.min(book.perDayStudyNumber || 20, book.length)
      store.word.bookList.push(book)

      try {
        localStorage.setItem(lsKey, version)
      } catch {
        /* ignore */
      }
      console.log(`[seed-books] 已导入 ${added} 个完整词条到词库「${bookName}」（v${version}）`)
    } catch (e) {
      console.warn(`[seed-books] 跳过「${bookName}」：`, e)
    }
  }

  async function seedAll() {
    if (running) return
    const store = useBaseStore()
    if (!store.load) return // 等 IndexedDB 数据加载完成，避免被 setState 覆盖
    running = true
    try {
      for (const s of SEEDS) await seedOne(s.name, s.url, s.version, s.ls)
      // 兜底：显式触发一次本地持久化（$subscribe 约 1s 内也会自动保存）
      try {
        const mod: any = await import('@/core/composables/useDataSyncPersistence.ts')
        mod?.useDataSyncPersistence?.().saveDictState?.()
      } catch {
        /* 交给 $subscribe */
      }
    } finally {
      running = false
    }
  }

  nuxtApp.hook('app:mounted', () => {
    const store = useBaseStore()
    if (store.load) {
      seedAll()
      return
    }
    const stop = watch(
      () => store.load,
      v => {
        if (v) {
          seedAll()
          setTimeout(() => stop(), 0)
        }
      },
    )
  })
})
