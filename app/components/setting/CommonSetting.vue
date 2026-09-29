<script setup lang="ts">
import { Switch, Textarea, Tooltip } from '@/base'
import SettingItem from './SettingItem.vue'
import { useSettingStore } from '@/core/stores/setting.ts'
import { useBaseStore } from '@/core/stores/base.ts'
import { ACCENTS } from '@/core/hooks/theme.ts'

const settingStore = useSettingStore()
const store = useBaseStore()

// 色板只用来画色块本身（各主题色的 600 色阶），真正的配色都在 main.scss 的主题色变量里
const SWATCH: Record<string, string> = {
  blue: '#2563eb',
  sky: '#0284c7',
  teal: '#0d9488',
  green: '#059669',
  indigo: '#4f46e5',
  violet: '#7c3aed',
  pink: '#db2777',
  rose: '#e11d48',
  orange: '#ea580c',
  graphite: '#334155',
}

const currentAccent = $computed(() => settingStore.themeColor || 'blue')

const simpleWords = $computed({
  get: () => store.simpleWords.join(','),
  set: v => {
    try {
      store.simpleWords = v.split(',')
    } catch (e) {}
  },
})
</script>

<template>
  <div>
    <SettingItem class="theme-color-item" :title="$t('theme_color')" :desc="$t('theme_color_desc')">
      <div class="swatches" role="radiogroup" :aria-label="$t('theme_color')">
        <Tooltip v-for="c in ACCENTS" :key="c" :title="$t('theme_color_' + c)">
          <button
            type="button"
            role="radio"
            class="swatch"
            :class="{ active: currentAccent === c }"
            :style="{ '--swatch': SWATCH[c] }"
            :aria-checked="currentAccent === c"
            :aria-label="$t('theme_color_' + c)"
            @click="settingStore.themeColor = c"
          >
            <IconLucideCheck class="swatch-check" />
          </button>
        </Tooltip>
      </div>
    </SettingItem>

    <div class="line"></div>
    <SettingItem :title="$t('ignore_case')" desc="开启后，输入时不区分大小写，如输入“hello”和“Hello”都会被认为是正确的">
      <Switch v-model="settingStore.ignoreCase" />
    </SettingItem>

    <div class="line"></div>
    <SettingItem :title="$t('simple_word_filter')" :desc="$t('simple_word_filter_desc')">
      <Switch v-model="settingStore.ignoreSimpleWord" />
    </SettingItem>

    <SettingItem :title="$t('simple_word_list')" class="items-start!" v-if="settingStore.ignoreSimpleWord">
      <Textarea
        :placeholder="$t('words_comma_separated')"
        v-model="simpleWords"
        :autosize="{ minRows: 6, maxRows: 10 }"
      />
    </SettingItem>
  </div>
</template>

<style scoped lang="scss">
/* 放不下一整排色块时，色块整体换到标题下面一行，而不是被挤成一竖列 */
.theme-color-item :deep(.setting-item__main) {
  flex-wrap: wrap;
  row-gap: 0.75rem;
}

.theme-color-item :deep(.setting-item__control) {
  min-width: min(100%, 22rem);
}

.swatches {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 0.625rem;
}

/*
 * 色块：选中时外圈以“留白 + 同色描边”的双层阴影收拢到色块上，对勾轻轻弹入。
 * 只动 box-shadow / transform / opacity。
 */
.swatch {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.625rem;
  height: 1.625rem;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  cursor: pointer;
  background: var(--swatch);
  box-shadow:
    0 0 0 0 var(--color-tile),
    0 0 0 0 var(--swatch),
    inset 0 -2px 0 rgba(0, 0, 0, 0.12);
  -webkit-tap-highlight-color: transparent;
  transition:
    box-shadow 220ms var(--ease-out),
    transform 160ms var(--ease-out);

  &:active {
    transform: scale(0.9);
    transition-duration: 220ms, var(--dur-press);
  }

  &:focus-visible {
    outline: 2px solid var(--swatch);
    outline-offset: 3px;
  }

  &.active {
    box-shadow:
      0 0 0 2px var(--color-tile),
      0 0 0 4px var(--swatch),
      inset 0 -2px 0 rgba(0, 0, 0, 0.12);
  }
}

.swatch-check {
  width: 0.875rem;
  height: 0.875rem;
  color: #fff;
  opacity: 0;
  transform: scale(0.5);
  transition:
    opacity 140ms var(--ease-out),
    transform 140ms var(--ease-out);

  .swatch.active & {
    opacity: 1;
    transform: none;
    transition-duration: 220ms;
  }
}

@media (hover: hover) and (pointer: fine) {
  .swatch:not(.active):hover {
    transform: scale(1.1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .swatch,
  .swatch-check {
    transition-duration: 0.01ms !important;
  }
}
</style>
