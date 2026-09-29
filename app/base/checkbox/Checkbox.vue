<template>
  <label class="checkbox" :class="{ 'is-disabled': disabled }" @click.stop>
    <input type="checkbox" :checked="modelValue" :disabled="disabled" @change="change" />
    <span class="checkbox-box" aria-hidden="true">
      <!-- 勾自己“画”出来：pathLength=1 让 dash 动画与路径实际长度无关 -->
      <svg class="checkbox-check" viewBox="0 0 16 16" fill="none">
        <path d="M4 8.4 6.8 11.2 12.2 5.2" pathLength="1" />
      </svg>
    </span>
    <span class="checkbox-label"><slot /></span>
  </label>
</template>

<script setup lang="ts">
defineProps({
  modelValue: Boolean,
  disabled: {
    type: Boolean,
    default: false,
  },
})

const emit = defineEmits(['update:modelValue', 'click', 'onChange'])

function change($event) {
  emit('update:modelValue', $event.target.checked)
  emit('onChange', $event.target.checked)
}
</script>

<style lang="scss" scoped>
/*
 * 极简复选框：选中时底色填满、白色对勾一笔画出（stroke-dashoffset），取消时对勾更快收回。
 * 只动颜色、描边偏移和 transform，不触发重排。
 */
.checkbox {
  position: relative;
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  user-select: none;
  -webkit-tap-highlight-color: transparent;

  /* 保留原生 input 可聚焦（键盘可用），只是看不见 */
  input {
    position: absolute;
    left: 0;
    top: 50%;
    width: 1px;
    height: 1px;
    margin: 0;
    opacity: 0;
    pointer-events: none;
  }

  .checkbox-box {
    position: relative;
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    margin-right: 8px;
    box-sizing: border-box;
    border-radius: 5px;
    background-color: var(--color-input-bg);
    box-shadow: inset 0 0 0 1.5px var(--color-stroke-strong);
    transition:
      background-color 160ms ease,
      box-shadow 160ms ease,
      transform 160ms var(--ease-out);
  }

  .checkbox-check {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;

    path {
      stroke: #fff;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
      stroke-dasharray: 1;
      stroke-dashoffset: 1;
      transition: stroke-dashoffset 120ms var(--ease-out);
    }
  }

  input:checked + .checkbox-box {
    background-color: var(--color-brand);
    box-shadow: inset 0 0 0 1.5px var(--color-brand);

    .checkbox-check path {
      stroke-dashoffset: 0;
      transition-duration: 240ms;
      transition-delay: 40ms;
    }
  }

  input:focus-visible + .checkbox-box {
    box-shadow:
      inset 0 0 0 1.5px var(--color-brand),
      var(--ring);
  }

  &:active:not(.is-disabled) .checkbox-box {
    transform: scale(0.88);
    transition-duration: 160ms, 160ms, var(--dur-press);
  }

  .checkbox-label {
    font-size: 14px;
    color: var(--color-ink-2);
  }

  &.is-disabled {
    cursor: not-allowed;
    opacity: 0.5;

    .checkbox-box {
      background-color: var(--color-tile-sunken);
    }
  }
}

@media (hover: hover) and (pointer: fine) {
  .checkbox:not(.is-disabled):hover input:not(:checked) + .checkbox-box {
    box-shadow: inset 0 0 0 1.5px var(--color-brand);
  }
}

@media (prefers-reduced-motion: reduce) {
  .checkbox .checkbox-check path,
  .checkbox .checkbox-box {
    transition-duration: 0.01ms !important;
  }
}
</style>
