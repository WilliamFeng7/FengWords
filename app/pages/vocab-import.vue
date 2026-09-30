<script setup lang="ts">
// 自包含词库导入工具页（用于把一批单词写入自定义词库）
// 数据全部走应用自身的 Pinia store -> IndexedDB 持久化，与手动加词完全一致，不改动任何其他文件。
// 删除本文件即可完全回滚（/vocab-import 会随之 404）。
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Toast } from '@/base'
import { useBaseStore } from '@/core/stores/base.ts'
import { getDefaultDict } from '@/core/types/func.ts'
import { DictType } from '@/core/types/enum.ts'
import { convertToWord } from '@/core/utils'
import { nanoid } from 'nanoid'
import type { Dict } from '@/core/types/types.ts'

const router = useRouter()
const store = useBaseStore()

const bookName = ref('Vocab')
const rawText = ref('')
const importing = ref(false)
const result = ref<{ name: string, added: number, skipped: number, total: number } | null>(null)

type Entry = { word: string, trans: string, phonetic0?: string, phonetic1?: string, sentences?: string }

// 解析输入：支持 JSON 数组（[{word, trans, phonetic0, phonetic1, sentences}] / ["apple", ...] / {words:[...]}），
// 或纯文本按行（每行 `单词` 或 `单词<TAB>释义`，也兼容以逗号/竖线分隔）。
function parseInput(text: string): Entry[] {
  const trimmed = (text || '').trim()
  if (!trimmed) return []

  // 优先尝试 JSON
  if (trimmed.startsWith('[') || trimmed.startsWith('{')) {
    try {
      const data = JSON.parse(trimmed)
      const arr: any[] = Array.isArray(data) ? data : Array.isArray(data?.words) ? data.words : []
      return arr
        .map((o: any) => {
          if (typeof o === 'string') return { word: o.trim(), trans: '' }
          return {
            word: String(o?.word ?? o?.vocabulary ?? o?.vocab ?? '').trim(),
            trans: String(o?.trans ?? o?.cn ?? o?.translation ?? o?.meaning ?? '').trim(),
            phonetic0: String(o?.phonetic0 ?? o?.uk ?? '').trim(),
            phonetic1: String(o?.phonetic1 ?? o?.us ?? '').trim(),
            sentences: String(o?.sentences ?? o?.example ?? '').trim(),
          }
        })
        .filter(e => e.word)
    } catch (e) {
      Toast.error('JSON 解析失败，请检查格式')
      return []
    }
  }

  // 纯文本按行
  return trimmed
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split(/\t|\s{2,}|\s*\|\s*/)
      if (parts.length >= 2) return { word: parts[0].trim(), trans: parts.slice(1).join('\n').trim() }
      // 退化：用第一个逗号分隔
      const idx = line.search(/[,，]/)
      if (idx > 0) return { word: line.slice(0, idx).trim(), trans: line.slice(idx + 1).trim() }
      return { word: line, trans: '' }
    })
    .filter(e => e.word)
}

const parsed = computed<Entry[]>(() => parseInput(rawText.value))

function onPickFile(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    rawText.value = String(reader.result || '')
    result.value = null
    Toast.success(`已读取「${file.name}」`)
  }
  reader.onerror = () => Toast.error('读取文件失败')
  reader.readAsText(file, 'utf-8')
}

function loadPreset() {
  rawText.value = JSON.stringify((globalThis as any).__VOCAB_PRESET__ ?? [], null, 2)
  result.value = null
}

async function doImport() {
  const items = parsed.value
  if (!items.length) {
    Toast.error('没有可导入的单词，请先选择文件或粘贴内容')
    return
  }
  const name = (bookName.value || '').trim() || 'Vocab'
  importing.value = true
  try {
    // 找到同名自定义词库，否则新建（与 createCustomDict 的写法一致）
    let book: Dict | undefined = store.word.bookList.find(b => b.custom && b.name === name)
    if (!book) {
      book = getDefaultDict({
        id: 'custom-dict-' + Date.now(),
        name,
        custom: true,
        type: DictType.word,
        language: 'en',
        translateLanguage: 'zh',
      })
      store.word.bookList.push(book)
    }

    const existing = new Set(book.words.map(w => String(w.word || '').trim().toLowerCase()))
    let added = 0
    let skipped = 0
    for (const it of items) {
      const w = String(it.word || '').trim()
      if (!w) continue
      if (existing.has(w.toLowerCase())) {
        skipped++
        continue
      }
      const word = convertToWord({
        id: nanoid(6),
        word: w,
        phonetic0: it.phonetic0 || '',
        phonetic1: it.phonetic1 || '',
        trans: it.trans || '',
        sentences: it.sentences || '',
      })
      word.custom = true
      book.words.push(word)
      existing.add(w.toLowerCase())
      added++
    }
    book.length = book.words.length
    if (book.perDayStudyNumber > book.length) book.perDayStudyNumber = book.length

    result.value = { name, added, skipped, total: book.words.length }
    Toast.success(`已导入 ${added} 个单词到「${name}」（跳过重复 ${skipped} 个）`)

    // 立即触发一次本地持久化（$subscribe 兜底，约 1s 内也会自动保存）
    try {
      const mod: any = await import('@/core/composables/useDataSyncPersistence.ts')
      if (mod?.useDataSyncPersistence) {
        const { saveDictState } = mod.useDataSyncPersistence()
        await saveDictState()
      }
    } catch {
      /* 持久化由 $subscribe 兜底 */
    }
  } finally {
    importing.value = false
  }
}

onMounted(async () => {
  // 可选：尝试载入同目录预置数据（便于从 /words 直达时一键导入）
  try {
    const res = await fetch('/vocab-import.json')
    if (res.ok) {
      const data = await res.json()
      ;(globalThis as any).__VOCAB_PRESET__ = data
    }
  } catch {
    /* 无预置数据也可手动选择文件/粘贴 */
  }
})
</script>

<template>
  <div class="vocab-import">
    <h2>批量导入词库</h2>
    <p class="tip">
      把一批单词导入到自定义词库。数据来源：<b>选择 JSON 文件</b> / <b>载入预置列表</b> / <b>直接粘贴</b>
      三选一。格式支持 <code>[{"word":"grant","trans":"v. 授予"}]</code>，或每行 <code>单词〔Tab/逗号〕释义</code>。
      释义里的词性用 <code>n. 拨款</code> 这种写法即可。重复的单词会自动跳过。
    </p>

    <div class="row">
      <label>词书名称：</label>
      <input v-model="bookName" class="name-input" placeholder="Vocab" maxlength="20" />
    </div>

    <div class="row btns">
      <label class="file-btn">
        选择文件
        <input type="file" accept=".json,.txt" @change="onPickFile" />
      </label>
      <button class="ghost" @click="loadPreset">载入预置列表（Vocab）</button>
      <span v-if="parsed.length" class="count">解析到 {{ parsed.length }} 条</span>
    </div>

    <textarea
      v-model="rawText"
      class="area"
      placeholder='例如：\n[\n  { "word": "Grant", "trans": "n. 拨款\\nv. 授予" },\n  { "word": "sabbatical", "trans": "n. 带薪学术休假" }\n]'
    ></textarea>

    <div class="row btns">
      <button class="primary" :disabled="importing || !parsed.length" @click="doImport">
        {{ importing ? '导入中…' : '导入到词库' }}
      </button>
      <button class="ghost" @click="router.push('/words')">去词库列表</button>
    </div>

    <div v-if="result" class="result">
      ✅ 已将 <b>{{ result.added }}</b> 个新单词导入词书「<b>{{ result.name }}</b>」{{
        result.skipped ? `（跳过重复 ${result.skipped} 个）` : ''
      }}，当前共 <b>{{ result.total }}</b> 词。
      <div class="result-sub">{{ $t('cloud_vocabulary_hint') }}</div>
    </div>
  </div>
</template>

<style scoped>
.vocab-import {
  max-width: 720px;
  margin: 0 auto;
  padding: 24px 16px 80px;
  color: var(--text-1, #222);
}
.vocab-import h2 {
  margin-bottom: 8px;
}
.tip {
  line-height: 1.7;
  font-size: 13px;
  opacity: 0.8;
  background: rgba(127, 127, 127, 0.08);
  border-radius: 8px;
  padding: 10px 12px;
}
.tip code {
  background: rgba(127, 127, 127, 0.15);
  padding: 1px 5px;
  border-radius: 4px;
}
.row {
  display: flex;
  align-items: center;
  gap: 10px;
  margin: 14px 0;
  flex-wrap: wrap;
}
.name-input {
  padding: 6px 10px;
  border: 1px solid rgba(127, 127, 127, 0.35);
  border-radius: 6px;
  font-size: 14px;
  width: 200px;
}
.area {
  width: 100%;
  min-height: 220px;
  padding: 10px 12px;
  border: 1px solid rgba(127, 127, 127, 0.35);
  border-radius: 8px;
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12.5px;
  line-height: 1.55;
  box-sizing: border-box;
  resize: vertical;
}
.file-btn {
  display: inline-flex;
  align-items: center;
  padding: 7px 14px;
  border: 1px solid rgba(127, 127, 127, 0.35);
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
}
.file-btn input {
  display: none;
}
button {
  padding: 8px 16px;
  border-radius: 6px;
  cursor: pointer;
  font-size: 14px;
  border: 1px solid transparent;
}
button.primary {
  background: var(--primary, #4f7cff);
  color: #fff;
}
button.primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
button.ghost {
  background: transparent;
  border: 1px solid rgba(127, 127, 127, 0.35);
  color: inherit;
}
.count {
  font-size: 13px;
  opacity: 0.7;
}
.result {
  margin-top: 16px;
  padding: 12px 14px;
  border-radius: 8px;
  background: rgba(46, 160, 67, 0.12);
  border: 1px solid rgba(46, 160, 67, 0.35);
  line-height: 1.7;
}
.result-sub {
  font-size: 12.5px;
  opacity: 0.8;
  margin-top: 4px;
}
</style>
