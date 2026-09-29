<template>
  <label
    :class="['radio', sizeClass, { 'is-disabled': isDisabled, 'is-checked': isChecked }]"
    role="radio"
    :aria-checked="isChecked"
    :aria-disabled="isDisabled || undefined"
    :tabindex="isDisabled ? -1 : 0"
    @click.prevent="onClick"
    @keydown.space.prevent="onClick"
    @keydown.enter.prevent="onClick"
  >
    <input type="radio" class="hidden" :value="value" :disabled="isDisabled" tabindex="-1" />
    <span class="radio__inner"></span>
    <span class="radio__label text-sm">
      <slot>{{ label }}</slot>
    </span>
  </label>
</template>

<script setup lang="ts">
import { inject, computed } from 'vue'

const props = defineProps({
  value: [String, Number, Boolean],
  label: [String, Number, Boolean],
  disabled: { type: Boolean, default: false },
})

// 注入父组状态
const radioGroupValue = inject<any>('radioGroupValue', null)
const radioGroupSize = inject('radioGroupSize', 'default')
const radioGroupDisabled = inject<boolean>('radioGroupDisabled', false)
const updateRadioGroupValue = inject<Function>('updateRadioGroupValue', null)

const sizeClass = computed(() => `radio--${radioGroupSize}`)

// 是否禁用
const isDisabled = computed(() => props.disabled || radioGroupDisabled)

// 是否选中
const isChecked = computed(() => radioGroupValue?.value === props.value)

// 选中时通知父组件
function onClick() {
  if (isDisabled.value) return
  updateRadioGroupValue?.(props.value)
}
</script>

<style scoped lang="scss">
/*
 * 极简单选：圆环用内阴影画，选中时内阴影从 1.5px 收紧到 5px —— 圆环向中心“收拢”，
 * 中间只留一个白点。只动 box-shadow，不改尺寸、不触发重排；按下时整颗轻轻缩一下。
 */
.radio {
  --radio-size: 16px;
  --radio-ring: 5px;
  display: inline-flex;
  align-items: center;
  gap: 0.45rem;
  flex-shrink: 0;
  cursor: pointer;
  user-select: none;
  outline: none;
  border-radius: 0.5rem;
  -webkit-tap-highlight-color: transparent;

  &:focus-visible .radio__inner {
    box-shadow:
      inset 0 0 0 1.5px var(--color-brand),
      var(--ring);
  }

  &.is-checked:focus-visible .radio__inner {
    box-shadow:
      inset 0 0 0 var(--radio-ring) var(--color-brand),
      var(--ring);
  }

  .radio__inner {
    position: relative;
    flex-shrink: 0;
    width: var(--radio-size);
    height: var(--radio-size);
    border-radius: 50%;
    box-sizing: border-box;
    background: var(--color-input-bg);
    box-shadow: inset 0 0 0 1.5px var(--color-stroke-strong);
    transition:
      box-shadow 220ms var(--ease-out),
      transform 160ms var(--ease-out),
      background-color 220ms ease;
  }

  .radio__label {
    color: var(--color-main-text);
    transition: color var(--dur-hover) ease;
  }

  &:active:not(.is-disabled) .radio__inner {
    transform: scale(0.88);
    transition-duration: 220ms, var(--dur-press), 220ms;
  }

  &.is-checked {
    .radio__inner {
      /* 白点底色固定为白，暗色模式下也清楚 */
      background: #fff;
      box-shadow: inset 0 0 0 var(--radio-ring) var(--color-brand);
    }

    .radio__label {
      color: var(--color-ink-1);
    }
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

@media (hover: hover) and (pointer: fine) {
  .radio:not(.is-disabled):not(.is-checked):hover .radio__inner {
    box-shadow: inset 0 0 0 1.5px var(--color-brand);
  }
}

.radio--small {
  --radio-size: 14px;
  --radio-ring: 4.5px;
}

.radio--large {
  --radio-size: 20px;
  --radio-ring: 6px;
}

@media (prefers-reduced-motion: reduce) {
  .radio .radio__inner {
    transition-duration: 0.01ms;
  }

  .radio:active .radio__inner {
    transform: none;
  }
}
</style>
