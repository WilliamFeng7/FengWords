<script setup lang="ts">
import { onBeforeUnmount, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useBaseStore } from '@/core/stores/base.ts'
import { isSameDictResource } from '@/core/utils'
import type { Dict } from '@/core/types/types.ts'

/*
 * “选择词典”：只在“我的词典”范围里选（自己的词典在前，收藏 / 错词 / 已掌握 在后），
 * 点一下就切换为当前学习的词典，留在首页继续学。要加新词典再去词库。
 */
const model = defineModel<boolean>({ default: false })
const emit = defineEmits<{ (e: 'select', dict: Dict): void }>()

const store = useBaseStore()
const router = useRouter()
let panelRef = $ref<HTMLElement | null>(null)

const mine = $computed(() => store.word.bookList.slice(3))
const builtin = $computed(() => store.word.bookList.slice(0, 3))

const isCurrent = (d: Dict) => isSameDictResource(store.sdict, d)
const percent = (d: Dict) => (d.length ? Math.min(100, Math.round((d.lastLearnIndex / d.length) * 100)) : 0)

function pick(d: Dict) {
  if (!d.length) return
  model.value = false
  if (!isCurrent(d)) emit('select', d)
}

function browseLibrary() {
  model.value = false
  router.push('/dict-list')
}

// 点外面、按 Esc 关闭
function onPointerDown(e: PointerEvent) {
  const anchor = panelRef?.parentElement
  if (anchor && !anchor.contains(e.target as Node)) model.value = false
}
function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') model.value = false
}
function unbind() {
  document.removeEventListener('pointerdown', onPointerDown, true)
  document.removeEventListener('keydown', onKeydown)
}
watch(model, open => {
  unbind()
  if (open) {
    document.addEventListener('pointerdown', onPointerDown, true)
    document.addEventListener('keydown', onKeydown)
  }
})
onBeforeUnmount(unbind)
</script>

<template>
  <Transition name="picker">
    <div v-if="model" ref="panelRef" class="dict-picker" role="listbox" :aria-label="$t('my_dictionaries')">
      <div class="picker-head">{{ $t('my_dictionaries') }}</div>

      <div class="picker-list">
        <template v-for="(group, gi) in [mine, builtin]" :key="gi">
          <div v-if="gi === 1" class="picker-label">{{ $t('dict_picker_builtin') }}</div>
          <button
            v-for="d in group"
            :key="d.id"
            type="button"
            role="option"
            class="picker-item"
            :class="{ 'is-current': isCurrent(d) }"
            :aria-selected="isCurrent(d)"
            :disabled="!d.length"
            @click="pick(d)"
          >
            <span class="picker-main">
              <span class="picker-name">{{ d.name }}</span>
              <span class="picker-meta tabular-nums">{{ d.lastLearnIndex }} / {{ d.length }}</span>
            </span>
            <span class="picker-bar" aria-hidden="true">
              <i :style="{ transform: `scaleX(${percent(d) / 100})` }"></i>
            </span>
            <IconLucideCheck v-if="isCurrent(d)" class="picker-check" />
          </button>
          <div v-if="gi === 0 && !mine.length" class="picker-empty">{{ $t('dict_picker_empty') }}</div>
        </template>
      </div>

      <button type="button" class="picker-foot" @click="browseLibrary">
        <span>{{ $t('dict_picker_add') }}</span>
        <IconLucideArrowRight class="i-nudge" />
      </button>
    </div>
  </Transition>
</template>

<style scoped lang="scss">
/* 从按钮的左上角长出来（弹层要有来处），不从正中间凭空出现 */
.dict-picker {
  position: absolute;
  top: calc(100% + 0.5rem);
  left: 0;
  z-index: 50;
  width: min(21rem, calc(100vw - 2rem));
  padding: 0.375rem;
  box-sizing: border-box;
  background: var(--color-tile);
  border: 1px solid var(--color-stroke);
  border-radius: 0.875rem;
  box-shadow: var(--shadow-pop);
  transform-origin: top left;
}

.picker-head {
  padding: 0.4rem 0.6rem 0.3rem;
  font-size: 0.75rem;
  font-weight: 600;
  letter-spacing: 0.06em;
  color: var(--color-ink-3);
}

.picker-list {
  max-height: min(22rem, 55vh);
  overflow-y: auto;
  overscroll-behavior: contain;
}

.picker-label {
  margin: 0.35rem 0.6rem 0.2rem;
  padding-top: 0.45rem;
  border-top: 1px solid var(--color-stroke);
  font-size: 0.72rem;
  color: var(--color-ink-3);
}

.picker-item {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  width: 100%;
  margin: 0;
  padding: 0.5rem 2rem 0.55rem 0.6rem;
  border: 0;
  border-radius: 0.6rem;
  text-align: left;
  cursor: pointer;
  color: var(--color-main-text);
  background: transparent;
  transition:
    background-color var(--dur-hover) ease,
    color var(--dur-hover) ease;

  &:active:not(:disabled) {
    background: var(--color-brand-soft-2);
    transition-duration: var(--dur-press);
  }

  &:disabled {
    cursor: not-allowed;
    opacity: 0.45;
  }

  &.is-current {
    background: var(--color-brand-soft);
    color: var(--color-brand-text);

    .picker-name {
      font-weight: 600;
    }
  }
}

@media (hover: hover) and (pointer: fine) {
  .picker-item:not(:disabled, .is-current):hover {
    background: var(--color-tile-sunken);
    color: var(--color-ink-1);
  }
}

.picker-main {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
}

.picker-name {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.9rem;
}

.picker-meta {
  flex-shrink: 0;
  font-size: 0.75rem;
  color: var(--color-ink-3);
}

/* 进度只用 scaleX 画，不改宽度 */
.picker-bar {
  display: block;
  height: 3px;
  border-radius: 3px;
  overflow: hidden;
  background: var(--color-stroke);

  i {
    display: block;
    height: 100%;
    background: var(--color-brand);
    transform-origin: left center;
  }
}

.picker-check {
  position: absolute;
  right: 0.6rem;
  top: 50%;
  width: 1rem;
  height: 1rem;
  margin-top: -0.5rem;
  color: var(--color-brand-text);
}

.picker-empty {
  padding: 0.6rem;
  font-size: 0.8rem;
  color: var(--color-ink-3);
}

.picker-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  margin: 0.25rem 0 0;
  padding: 0.55rem 0.6rem;
  border: 0;
  border-top: 1px solid var(--color-stroke);
  border-radius: 0 0 0.6rem 0.6rem;
  background: transparent;
  cursor: pointer;
  font-size: 0.85rem;
  color: var(--color-link);
  transition: background-color var(--dur-hover) ease;

  svg {
    width: 0.95rem;
    height: 0.95rem;
  }
}

@media (hover: hover) and (pointer: fine) {
  .picker-foot:hover {
    background: var(--color-tile-sunken);
  }
}

.picker-enter-active {
  transition:
    opacity 180ms var(--ease-out),
    transform 180ms var(--ease-out);
}

.picker-leave-active {
  transition:
    opacity 120ms var(--ease-out),
    transform 120ms var(--ease-out);
}

.picker-enter-from,
.picker-leave-to {
  opacity: 0;
  transform: translate3d(0, -4px, 0) scale(0.97);
}

@media (prefers-reduced-motion: reduce) {
  .picker-enter-from,
  .picker-leave-to {
    transform: none;
  }
}
</style>
