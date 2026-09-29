<script setup lang="ts">
import { ref, computed, watch } from 'vue'

interface IProps {
  modelValue: boolean
  disabled?: boolean
  width?: number // 开关宽度，默认 38px
  activeText?: string // 开启状态显示文字（默认不显示，保持简约）
  inactiveText?: string // 关闭状态显示文字
  type?: 'primary' | 'info'
}

const props = withDefaults(defineProps<IProps>(), {
  activeText: '',
  inactiveText: '',
  type: 'primary',
})

const emit = defineEmits(['update:modelValue', 'change'])

const isChecked = ref(props.modelValue)

watch(
  () => props.modelValue,
  val => {
    isChecked.value = val
  }
)

const toggle = () => {
  if (props.disabled) return
  isChecked.value = !isChecked.value
  emit('update:modelValue', isChecked.value)
  emit('change', isChecked.value)
}

const onKeydown = (e: KeyboardEvent) => {
  if (e.code === 'Space' || e.key === ' ' || e.key === 'Enter') {
    e.preventDefault()
    toggle()
  }
}

// 尺寸都交给 CSS 变量：滑块的位置与按下时的拉伸由同一组变量算出，二者始终对齐
const switchWidth = computed(() => props.width ?? 38)
const switchHeight = computed(() => Math.round(switchWidth.value * 0.58))
const vars = computed(() => ({
  '--sw-w': switchWidth.value + 'px',
  '--sw-h': switchHeight.value + 'px',
  '--sw-knob': switchHeight.value - 4 + 'px',
}))
</script>

<template>
  <div
    class="switch"
    :class="{ checked: isChecked, disabled: disabled, [type]: true }"
    :tabindex="disabled ? -1 : 0"
    role="switch"
    :aria-checked="isChecked"
    :aria-disabled="disabled || undefined"
    @click="toggle"
    @keydown="onKeydown"
    :style="vars"
  >
    <span class="text left" v-if="activeText" aria-hidden="true">{{ activeText }}</span>
    <span class="text right" v-if="inactiveText" aria-hidden="true">{{ inactiveText }}</span>
    <span class="ball"></span>
  </div>
</template>

<style scoped lang="scss">
/*
 * 极简拨动开关：
 * - 轨道只做颜色过渡；滑块只动 transform（合成层），曲线是强 ease-out，落点干脆
 * - 按下时滑块朝行进方向拉长一点（像按住的橡皮），松手再弹回：给“我听到你了”的即时反馈
 */
.switch {
  --sw-press: 5px;
  --sw-knob-w: var(--sw-knob);
  --sw-x: 0px;
  position: relative;
  display: inline-flex;
  align-items: center;
  flex-shrink: 0;
  box-sizing: border-box;
  width: var(--sw-w);
  height: var(--sw-h);
  border-radius: 999px;
  cursor: pointer;
  user-select: none;
  outline: none;
  -webkit-tap-highlight-color: transparent;
  transition:
    background-color 220ms ease,
    box-shadow var(--dur-hover) ease;

  &:focus-visible {
    box-shadow: var(--ring);
  }

  &.checked {
    /* 行程 = 轨道宽 − 滑块宽 − 两侧各 2px 留白；滑块被拉长时同步左移，拉长的部分朝向中间 */
    --sw-x: calc(var(--sw-w) - var(--sw-knob-w) - 4px);
  }

  &:active:not(.disabled) {
    --sw-knob-w: calc(var(--sw-knob) + var(--sw-press));
  }

  .ball {
    position: absolute;
    top: 2px;
    left: 2px;
    width: var(--sw-knob-w);
    height: var(--sw-knob);
    border-radius: 999px;
    background: #fff;
    box-shadow:
      0 1px 2px rgba(15, 23, 42, 0.22),
      0 1px 1px rgba(15, 23, 42, 0.06);
    transform: translate3d(var(--sw-x), 0, 0);
    transition:
      transform 260ms var(--ease-out),
      width 200ms var(--ease-out),
      background-color 220ms ease;
  }

  .text {
    position: absolute;
    font-size: 0.7rem;
    line-height: 1;
    pointer-events: none;
    transition: opacity 180ms ease;

    &.left {
      left: 0.45rem;
      opacity: 0;
    }

    &.right {
      right: 0.45rem;
    }
  }

  &.checked .text {
    &.left {
      opacity: 1;
    }

    &.right {
      opacity: 0;
    }
  }

  &.primary {
    background: var(--color-stroke-strong);

    .text {
      color: var(--color-ink-2);
    }

    &.checked {
      background: var(--color-brand);

      .text {
        color: #fff;
      }
    }
  }

  &.info {
    background: var(--color-tile);
    box-shadow: 0 0 0 1px var(--color-stroke-strong) inset;

    .ball {
      background: var(--color-stroke-strong);
      box-shadow: none;
    }

    .text {
      color: var(--color-ink-3);
    }

    &.checked {
      background: var(--color-brand);
      box-shadow: none;

      .ball {
        background: #fff;
        box-shadow:
          0 1px 2px rgba(15, 23, 42, 0.22),
          0 1px 1px rgba(15, 23, 42, 0.06);
      }

      .text {
        color: #fff;
      }
    }

    &:focus-visible {
      box-shadow: var(--ring);
    }
  }

  &.disabled {
    cursor: not-allowed;
    opacity: 0.5;
  }
}

@media (hover: hover) and (pointer: fine) {
  .switch.primary:not(.checked):not(.disabled):hover {
    background: color-mix(in srgb, var(--color-stroke-strong) 78%, var(--color-ink-3));
  }

  .switch.primary.checked:not(.disabled):hover {
    background: var(--color-brand-hover);
  }
}

@media (prefers-reduced-motion: reduce) {
  .switch .ball {
    transition-duration: 0.01ms;
  }
}
</style>
