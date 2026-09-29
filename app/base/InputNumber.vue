<template>
  <div class="input-number inline-center select-none" :class="{ 'is-disabled': disabled }">
    <!-- 减号 -->
    <button
      class="btn minus-btn inline-center cursor-pointer border-none outline-none"
      type="button"
      :disabled="disabled || isMin"
      @mousedown.prevent="onHold(-1)"
      @mouseup="onRelease"
      @mouseleave="onRelease"
      aria-label="decrease"
    >
      <IconLucideMinus />
    </button>

    <!-- 输入框 -->
    <input
      ref="inputRef"
      class="flex-1 h-8 px-1 text-center border-none outline-none bg-transparent input-inner w-12"
      :value="displayValue"
      :disabled="disabled"
      inputmode="decimal"
      @input="e => (displayValue = e.target.value)"
      @keydown.up.prevent="change(1, false)"
      @keydown.down.prevent="change(-1, false)"
      @blur="onBlur"
    />

    <!-- 加号 -->
    <button
      class="btn plus-btn inline-center cursor-pointer border-none outline-none"
      type="button"
      :disabled="disabled || isMax"
      @mousedown.prevent="onHold(1)"
      @mouseup="onRelease"
      @mouseleave="onRelease"
      aria-label="increase"
    >
      <IconLucidePlus />
    </button>
  </div>
</template>

<script setup lang="ts">
import {ref, computed, onBeforeUnmount, watch} from 'vue'

const props = defineProps({
  modelValue: {type: [Number, String], default: null},
  min: {type: Number, default: -Infinity},
  max: {type: Number, default: Infinity},
  step: {type: Number, default: 1},
  precision: {type: Number},
  disabled: {type: Boolean, default: false},
  stepStrictly: {type: Boolean, default: false},
})

const emit = defineEmits(['update:modelValue', 'input', 'change'])

const inputRef = ref<HTMLInputElement | null>(null)
const inner = ref<number | null>(normalizeToNumber(props.modelValue))
let holdTimer: number | null = null
let holdInterval: number | null = null

watch(() => props.modelValue, (value: number) => {
  inner.value = value
})
const displayValue = computed({
  get: () => inner.value === null ? '' : format(inner.value),
  set: v => {
    const n = parseInput(v)
    if (n === 'editing') return
    setValue(n)
  }
})

const isMin = computed(() => inner.value !== null && inner.value <= props.min)
const isMax = computed(() => inner.value !== null && inner.value >= props.max)

function normalizeToNumber(v: any): number | null {
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

function clamp(n: number | null) {
  if (n === null) return null
  if (n < props.min) return props.min
  if (n > props.max) return props.max
  return n
}

function format(n: number) {
  return props.precision != null ? n.toFixed(props.precision) : String(n)
}

function parseInput(s: string): number | 'editing' | null {
  const trimmed = s.trim()
  if (['', '-', '+', '.', '-.', '+.'].includes(trimmed)) return 'editing'
  const n = Number(trimmed)
  return Number.isFinite(n) ? n : 'editing'
}

function applyStepStrict(n: number | null) {
  if (n === null) return null
  if (!props.stepStrictly) return n
  const base = Number.isFinite(props.min) ? props.min : 0
  const k = Math.round((n - base) / props.step)
  return base + k * props.step
}

function toPrecision(n: number) {
  return props.precision != null ? Number(n.toFixed(props.precision)) : n
}

function setValue(n: number | null) {
  const v = clamp(toPrecision(applyStepStrict(n)))
  inner.value = v
  emit('update:modelValue', v)
  emit('input', v)
  emit('change', v)
}

// 点按钮改数时，数字从行进方向轻轻滚入（+ 从下往上、− 从上往下）；键盘改数不做动画
function tick(dir: 1 | -1) {
  const el = inputRef.value
  if (!el || typeof el.animate !== 'function') return
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  el.animate(
    [
      { transform: `translate3d(0, ${dir * 6}px, 0)`, opacity: 0.35 },
      { transform: 'translate3d(0, 0, 0)', opacity: 1 },
    ],
    { duration: 200, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' }
  )
}

function change(dir: 1 | -1, animate = true) {
  if (props.disabled) return
  const base = inner.value ?? (Number.isFinite(props.min) ? props.min : 0)
  const before = inner.value
  setValue(base + dir * props.step)
  if (animate && inner.value !== before) tick(dir)
}

function onHold(dir: 1 | -1) {
  change(dir)
  holdTimer = window.setTimeout(() => {
    holdInterval = window.setInterval(() => change(dir), 100)
  }, 400)
}

function onRelease() {
  if (holdTimer) {
    clearTimeout(holdTimer);
    holdTimer = null
  }
  if (holdInterval) {
    clearInterval(holdInterval);
    holdInterval = null
  }
}

function onBlur() {
  const n = parseInput(displayValue.value)
  setValue(n === 'editing' ? inner.value : n)
}

onBeforeUnmount(onRelease)
</script>

<style scoped lang="scss">
/* 极简步进器：一整颗圆角胶囊，按钮是透明的，悬停只染一点底色，按下轻轻缩一下 */
.input-number {
  height: 2.125rem;
  padding: 0 0.1875rem;
  box-sizing: border-box;
  overflow: hidden;
  border-radius: var(--radius-control);
  background: var(--color-input-bg);
  box-shadow: inset 0 0 0 1px var(--color-input-border);
  transition: box-shadow var(--dur-hover) ease;

  &:hover:not(.is-disabled) {
    box-shadow: inset 0 0 0 1px var(--color-ink-3);
  }

  &:focus-within:not(.is-disabled) {
    box-shadow:
      inset 0 0 0 1px var(--color-brand),
      var(--ring);
  }

  &.is-disabled {
    opacity: 0.4;

    .btn,
    .input-inner {
      cursor: not-allowed;
    }
  }

  .input-inner {
    color: var(--color-input-color);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }

  .btn {
    flex-shrink: 0;
    width: 1.75rem;
    height: 1.75rem;
    padding: 0;
    border-radius: calc(var(--radius-control) - 3px);
    background: transparent;
    color: var(--color-ink-2);
    transition:
      background-color var(--dur-hover) ease,
      color var(--dur-hover) ease,
      opacity var(--dur-hover) ease,
      transform 160ms var(--ease-out);

    svg {
      display: block;
      width: 0.95rem;
      height: 0.95rem;
    }

    &:active:not(:disabled) {
      transform: scale(0.88);
      transition-duration: var(--dur-hover), var(--dur-hover), var(--dur-hover), var(--dur-press);
    }

    &:disabled {
      opacity: 0.35;
      cursor: not-allowed;
    }
  }
}

@media (hover: hover) and (pointer: fine) {
  .input-number .btn:not(:disabled):hover {
    background: var(--color-brand-soft);
    color: var(--color-brand-text);
  }
}

@media (prefers-reduced-motion: reduce) {
  .input-number .btn:active {
    transform: none !important;
  }
}
</style>
