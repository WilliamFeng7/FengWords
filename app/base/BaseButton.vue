<script setup lang="ts">
import Tooltip from './Tooltip.vue'
import type { ButtonProps } from './types.ts'

withDefaults(defineProps<ButtonProps>(), {
  type: 'primary',
  size: 'normal',
})

defineEmits(['click'])
</script>

<template>
  <Tooltip :disabled="!keyboard" :title="`${keyboard}`">
    <div
      class="base-button"
      v-bind="$attrs"
      @click="e => !disabled && !loading && $emit('click', e)"
      :class="[active && 'active', size, type, (disabled || loading) && 'disabled']"
    >
      <!-- 加载中：文字带一点模糊淡出、转圈缩放淡入，两种状态像是一个在变成另一个，而不是硬切 -->
      <span class="btn-label" :class="{ 'is-hidden': loading }"><slot></slot></span>
      <Transition name="btn-spin">
        <IconEosIconsLoading
          v-if="loading"
          class="loading"
          width="18"
          :color="type === 'primary' ? '#ffffff' : 'currentColor'"
        />
      </Transition>
    </div>
  </Tooltip>
</template>

<style>
:root {
  --btn-primary: var(--color-brand);
  --btn-primary-disabled: var(--color-brand-disabled);
  --btn-primary-hover: var(--color-brand-hover);
  --btn-info: var(--color-tile);
  --btn-info-hover: var(--color-tile-sunken);
  /* "orange" is the emphasis button: the inverse (white) CTA on brand surfaces, in every theme color */
  --btn-orange: #ffffff;
  --btn-orange-hover: var(--color-brand-tint);
}

html.dark {
  --btn-info: var(--color-tile-sunken);
  --btn-info-hover: #1c2945;
}
</style>

<style scoped lang="scss">
.base-button {
  position: relative;
  cursor: pointer;
  box-sizing: border-box;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  outline: none;
  text-align: center;
  user-select: none;
  vertical-align: middle;
  white-space: nowrap;
  border-radius: var(--radius-control);
  padding: 0 0.9rem;
  font-size: 0.9rem;
  font-weight: 500;
  height: 2rem;
  color: white;
  border: 1px solid transparent;
  transition:
    background-color var(--dur-hover) ease,
    border-color var(--dur-hover) ease,
    color var(--dur-hover) ease,
    box-shadow var(--dur-hover) ease,
    opacity var(--dur-hover) ease,
    transform 160ms var(--ease-out);

  & + .base-button {
    margin-left: 1rem;
  }

  &:active {
    transform: scale(0.97);
    transition-duration: var(--dur-hover), var(--dur-hover), var(--dur-hover), var(--dur-hover), var(--dur-hover),
      var(--dur-press);
  }

  &:focus-visible {
    box-shadow: var(--ring);
  }

  &.disabled {
    opacity: 0.6;
    cursor: not-allowed;
    user-select: none;
    pointer-events: none;
    color: rgba(#fff, 0.4);
  }

  .loading {
    position: absolute;
  }

  &.small {
    border-radius: 0.5rem;
    padding: 0 0.6rem;
    height: 1.6rem;
    font-size: 0.8rem;
  }

  &.large {
    padding: 0 1.3rem;
    height: 2.4rem;
    font-size: 0.92rem;
    border-radius: 0.75rem;
  }

  & > span {
    line-height: 1;
    transform: translateY(-5%);
    transition:
      opacity 160ms ease,
      filter 160ms ease;

    &.is-hidden {
      opacity: 0;
      filter: blur(2px);
    }


    :deep(a) {
      color: white;
    }
  }

  &.primary {
    background: var(--btn-primary);
    box-shadow: 0 1px 0 rgba(255, 255, 255, 0.14) inset, 0 6px 14px -8px rgba(var(--color-brand-rgb), 0.6);

    &.disabled {
      opacity: 1;
      background: var(--btn-primary-disabled);
      color: rgba(255, 255, 255, 0.8);
      box-shadow: none;
    }

    &:hover:not(.disabled) {
      background: var(--btn-primary-hover);
    }
  }

  &.info {
    background: var(--btn-info);
    border-color: var(--color-stroke-strong);
    color: var(--color-main-text);

    &:hover:not(.disabled) {
      background: var(--btn-info-hover);
      border-color: var(--color-ink-3);
    }
  }

  &.text {
    border-color: var(--color-stroke-strong);
    color: var(--color-main-text);

    &:hover:not(.disabled) {
      background: var(--btn-info-hover);
    }
  }

  &.orange {
    background: var(--btn-orange);
    color: var(--color-brand);
    font-weight: 600;
    box-shadow: 0 8px 18px -10px rgba(15, 23, 42, 0.45);

    &:hover:not(.disabled) {
      background: var(--btn-orange-hover);
      color: var(--color-brand-hover);
    }
  }

  &.active {
    opacity: 0.4;
  }
}

/*
 * 阴影是按钮的第二层动效：悬停时投影加深，像被抬起一点；按下时投影收紧、按钮缩一点，像被按进页面。
 * 只改阴影不做位移，分体按钮（开始学习 + 下拉）的两半始终对齐。
 */
@media (hover: hover) and (pointer: fine) {
  .base-button.primary:hover:not(.disabled) {
    box-shadow:
      0 1px 0 rgba(255, 255, 255, 0.18) inset,
      0 10px 22px -10px rgba(var(--color-brand-rgb), 0.7);
  }

  .base-button.orange:hover:not(.disabled) {
    box-shadow: 0 12px 24px -12px rgba(15, 23, 42, 0.5);
  }
}

.base-button.primary:active:not(.disabled) {
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.14) inset,
    0 3px 8px -6px rgba(var(--color-brand-rgb), 0.6);
}

.base-button.orange:active:not(.disabled) {
  box-shadow: 0 4px 10px -8px rgba(15, 23, 42, 0.45);
}

.btn-spin-enter-active,
.btn-spin-leave-active {
  transition:
    opacity 160ms var(--ease-out),
    transform 160ms var(--ease-out);
}

.btn-spin-enter-from,
.btn-spin-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

@media (prefers-reduced-motion: reduce) {
  .base-button:active {
    transform: none;
  }

  .btn-spin-enter-from,
  .btn-spin-leave-to {
    transform: none;
  }
}
</style>
