<script setup lang="ts">
import { _getAccomplishDate, _getAccomplishDays } from '@/core/utils'
import { InputNumber, RollNumber, Slider, Toast } from '@/base'
import { defineAsyncComponent, watch } from 'vue'
import { useSettingStore } from '@/core/stores/setting'
import ChangeLastPracticeIndexDialog from './ChangeLastPracticeIndexDialog.vue'
import { useRuntimeStore } from '@/core/stores/runtime'

const Dialog = defineAsyncComponent(() => import('@/base/dialog/Dialog.vue'))

const settings = useSettingStore()
const runtimeStore = useRuntimeStore()

const model = defineModel<boolean>()

const props = defineProps<{
  showLeftOption?: boolean
  onConfirm?: () => Promise<void | boolean>
}>()

const emit = defineEmits<{
  ok: []
}>()

let showPicker = $ref(false)
let perDay = $ref(20)
let ratio = $ref(0)
let start = $ref(0)

const dict = $computed(() => runtimeStore.editDict)
const total = $computed(() => dict.length || dict.words.length || 0)
const remaining = $computed(() => Math.max(0, total - Number(start || 0)))
const days = $computed(() => _getAccomplishDays(remaining, Number(perDay) || 0))
const finishDate = $computed(() => _getAccomplishDate(remaining, Number(perDay) || 0))
const reviewCap = $computed(() => Math.floor((Number(perDay) || 0) * (Number(ratio) || 0)))
const startScale = $computed(() => (total ? Math.min(1, Number(start || 0) / total) : 0))
const nextWord = $computed(() => dict.words[Number(start) || 0]?.word ?? '')

watch(
  () => model.value,
  open => {
    if (!open) return
    if (!dict.id) {
      Toast.warning($t('please_select_dict'))
      return
    }
    perDay = dict.perDayStudyNumber
    start = Math.min(dict.lastLearnIndex, total)
    ratio = settings.wordReviewRatio
  }
)

function save() {
  runtimeStore.editDict.perDayStudyNumber = Number(perDay)
  runtimeStore.editDict.lastLearnIndex = Number(start)
  settings.wordReviewRatio = Number(ratio)
  return props.onConfirm?.()
}
</script>

<template>
  <Dialog v-model="model" :title="$t('learning_settings')" padding :footer="true" :onConfirm="save" @ok="emit('ok')">
    <div class="ps">
      <!-- 概览：多久能学完 -->
      <div class="ps-summary">
        <div class="ps-dict">{{ dict.name }}</div>
        <template v-if="remaining > 0">
          <i18n-t keypath="days_to_finish" tag="div" class="ps-days">
            <template #n>
              <RollNumber class="ps-days-num" :value="days" />
            </template>
          </i18n-t>
          <div class="ps-muted">{{ $t('finish_around', { date: finishDate }) }}</div>
        </template>
        <div v-else class="ps-days">
          <span class="ps-days-num">{{ $t('all_words_learned') }}</span>
        </div>
        <div class="ps-bar" aria-hidden="true">
          <i :style="{ transform: `scaleX(${startScale})` }"></i>
        </div>
        <div class="ps-muted tabular-nums">{{ $t('words_left_of_total', { left: remaining, total }) }}</div>
      </div>

      <!-- 每日新词 -->
      <section class="ps-field">
        <div class="ps-row">
          <label class="ps-label">{{ $t('daily_new_words') }}</label>
          <InputNumber :min="1" :max="500" v-model="perDay" />
        </div>
        <Slider class="ps-slider" :min="1" :max="500" v-model="perDay" />
        <p class="ps-hint">{{ reviewCap ? $t('max_review_per_day', { n: reviewCap }) : $t('no_review_words') }}</p>
      </section>

      <!-- 复习比例 -->
      <section class="ps-field">
        <div class="ps-row">
          <label class="ps-label">{{ $t('review_ratio') }}</label>
          <InputNumber :min="0" :max="10" v-model="ratio" />
        </div>
        <p class="ps-hint">{{ $t('review_ratio_tooltip') }}</p>
        <div v-if="!Number(ratio)" class="ps-note">
          <p>{{ $t('review_ratio_notice_1') }}</p>
          <p>{{ $t('review_ratio_notice_2') }}</p>
        </div>
      </section>

      <!-- 起点 -->
      <section class="ps-field">
        <div class="ps-row">
          <label class="ps-label">{{ $t('start_from_word') }}</label>
          <InputNumber :min="0" :max="total" v-model="start" />
        </div>
        <Slider class="ps-slider" :min="0" :max="total" v-model="start" />
        <div class="ps-row ps-row--hint">
          <p class="ps-hint ps-ellipsis">
            {{ nextWord ? $t('next_new_word', { word: nextWord }) : remaining ? '' : $t('all_words_learned') }}
          </p>
          <button v-if="dict.words.length" type="button" class="ps-link" @click="showPicker = true">
            <span>{{ $t('pick_from_list') }}</span>
            <IconLucideArrowRight class="i-nudge" />
          </button>
        </div>
      </section>
    </div>
  </Dialog>

  <ChangeLastPracticeIndexDialog
    v-model="showPicker"
    @ok="
      e => {
        start = e
        showPicker = false
      }
    "
  />
</template>

<style scoped lang="scss">
.ps {
  box-sizing: border-box;
  width: min(32rem, calc(100vw - 3.5rem));
  max-height: min(68vh, 38rem);
  overflow-y: auto;
  overscroll-behavior: contain;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  padding: 0.9rem 0 0.25rem;
  color: var(--color-main-text);
}

.ps-summary {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 1rem 1.1rem 0.9rem;
  border-radius: var(--radius-inner);
  background: var(--color-tile-sunken);
  border: 1px solid var(--color-stroke);
}

.ps-dict {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-ink-3);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ps-days {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 0.35rem;
  color: var(--color-ink-2);
}

.ps-days-num {
  font-size: 1.9rem;
  font-weight: 700;
  line-height: 1.2;
  letter-spacing: -0.02em;
  color: var(--color-brand-text);
}

.ps-muted {
  font-size: 0.82rem;
  color: var(--color-ink-3);
}

/* 起点在整本书里的位置：只动 scaleX */
.ps-bar {
  height: 6px;
  margin: 0.55rem 0 0.35rem;
  border-radius: 999px;
  overflow: hidden;
  background: var(--color-stroke);

  i {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--color-brand);
    transform-origin: left center;
    transition: transform var(--dur-tile) var(--ease-out);
  }
}

.ps-field {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

/* 滑块轨道两端各让出半个圆点：拖到 0 或最大值时圆点不会被滚动区域裁掉 */
.ps-slider {
  box-sizing: border-box;
  padding: 0 0.5rem;
}

.ps-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  min-width: 0;
}

.ps-label {
  font-weight: 600;
  color: var(--color-ink-1);
}

.ps-hint {
  margin: 0;
  font-size: 0.82rem;
  line-height: 1.5;
  color: var(--color-ink-3);
}

.ps-ellipsis {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.ps-note {
  padding: 0.6rem 0.8rem;
  border-radius: 0.6rem;
  background: var(--color-brand-soft);
  font-size: 0.8rem;
  line-height: 1.55;
  color: var(--color-ink-2);

  p {
    margin: 0;
  }
}

.ps-link {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.1rem;
  border: 0;
  background: transparent;
  font-size: 0.85rem;
  color: var(--color-link);
  cursor: pointer;

  svg {
    width: 0.95rem;
    height: 0.95rem;
  }

  &:active {
    transform: scale(0.97);
  }
}

@media (max-width: 640px) {
  .ps {
    width: min(32rem, calc(100vw - 2.5rem));
    max-height: 62vh;
    gap: 1.1rem;
  }

  /* 手指好按：步进器加大 */
  .ps :deep(.input-number) {
    height: 2.5rem;

    .btn {
      width: 2.25rem;
      height: 2.25rem;
    }
  }
}
</style>
