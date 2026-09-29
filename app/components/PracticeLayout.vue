<script setup lang="ts">
import { useSettingStore } from '@/core/stores/setting'
import { nextTick, watch } from 'vue'

const settingStore = useSettingStore()
const props = withDefaults(
  defineProps<{
    panelLeft: string
    /** 面板宽度（与面板实际宽度一致，用来算它会不会超出屏幕） */
    panelWidth?: string
  }>(),
  { panelWidth: 'var(--panel-width)' }
)

// 面板理想位置在练习区右侧；屏幕不够宽时算出会超出多少，练习区与底栏整体左移这么多，面板永远完整可见
const shiftStyle = $computed(() => ({
  '--practice-shift': `max(0px, calc(${props.panelLeft} + ${props.panelWidth} + 1.25rem - 100vw))`,
}))

let wrapRef = $ref<HTMLElement | null>(null)
let footerRef = $ref<HTMLElement | null>(null)

// 开关面板时练习区的位移是真实布局变化；用 FLIP（先量、再变、用 transform 补回并过渡到 0）让它平滑滑开，而不是瞬移
function glide(el: HTMLElement | null, dx: number) {
  if (!el || Math.abs(dx) < 1) return
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
  el.animate([{ transform: `translate3d(${dx}px, 0, 0)` }, { transform: 'none' }], {
    duration: 320,
    easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
  })
}

watch(
  () => settingStore.showPanel,
  () => {
    const wrapBefore = wrapRef?.getBoundingClientRect().left ?? 0
    const footerBefore = footerRef?.getBoundingClientRect().left ?? 0
    nextTick(() => {
      glide(wrapRef, wrapBefore - (wrapRef?.getBoundingClientRect().left ?? 0))
      // 底栏收起时里面固定定位的迷你进度条依赖视口定位，此时不给底栏加 transform
      if (settingStore.showToolbar) glide(footerRef, footerBefore - (footerRef?.getBoundingClientRect().left ?? 0))
    })
  },
  { flush: 'pre' }
)
</script>

<template>
  <div
    class="practice-layout flex justify-center relative"
    :class="[!settingStore.showToolbar && 'footer-hide', settingStore.showPanel && 'panel-open']"
    :style="shiftStyle"
  >
    <div class="wrap" id="PracticeArea" ref="wrapRef">
      <slot name="practice"></slot>
    </div>
    <div
      class="panel-wrap"
      :style="{ left: `calc(${panelLeft} - var(--practice-shift))` }"
      :class="{ 'has-panel': settingStore.showPanel }"
      @click.self="settingStore.showPanel = false"
    >
      <slot name="panel"></slot>
    </div>
    <div class="footer-wrap" ref="footerRef">
      <slot name="footer"></slot>
    </div>
  </div>
</template>

<style scoped lang="scss">
/*
 * 进入一次练习（每次学习只发生一次）：练习区轻轻升起，底栏随后从下方跟上，面板从右侧滑入（Panel 的 appear）。
 * 底栏隐藏时不给它加 transform —— 里面固定定位的迷你进度条依赖视口定位。
 */
.wrap {
  animation: tile-in 260ms var(--ease-out) backwards;
}

.practice-layout:not(.footer-hide) .footer-wrap {
  animation: practice-footer-in 300ms var(--ease-out) 60ms backwards;
}

@keyframes practice-footer-in {
  from {
    opacity: 0;
    transform: translate3d(0, 12px, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .wrap,
  .practice-layout:not(.footer-hide) .footer-wrap {
    animation-name: fade-in;
  }
}

.footer-hide {
  .footer-wrap {
    bottom: -6rem;
  }
}

.footer-wrap {
  position: fixed;
  bottom: calc(env(safe-area-inset-bottom, 0px));
  transition: bottom 320ms var(--ease-drawer);
  z-index: 999;
}

.panel-wrap {
  position: fixed;
  top: 0.8rem;
  z-index: 1;
  height: calc(100vh - 1.8rem);
}

/* side mode: when the panel is open, the practice area and the (statically centred) footer
   make room for it by shifting left exactly as much as it would otherwise overflow */
@media (min-width: 1440px) {
  .practice-layout.panel-open {
    padding-right: calc(2 * var(--practice-shift));
  }
}

/* narrower screens: the panel becomes a right-side drawer over a light scrim — it never jumps
   to a different place, it only stops sitting beside the content */
@media (max-width: 1439px) {
  .practice-layout {
    --practice-shift: 0px !important;
  }

  .panel-wrap {
    position: fixed;
    top: 0;
    left: 0 !important;
    right: 0 !important;
    bottom: 0;
    height: 100vh;
    z-index: 1000;
    display: flex;
    align-items: stretch;
    justify-content: flex-end;
    padding: 0.75rem;
    box-sizing: border-box;

    // 当面板未显示时，禁用指针事件
    pointer-events: none;

    transition: background-color 220ms ease;

    // 只有当面板显示时才添加背景蒙版并启用指针事件
    &.has-panel {
      background: rgba(15, 23, 42, 0.32);
      pointer-events: auto;
    }
  }
}


@media (max-width: 768px) {
  .panel-wrap {
    align-items: center;
    justify-content: center;
  }

  .wrap {
    height: calc(100vh - 6rem);
    width: 100vw;
    padding: 0 1rem;
    box-sizing: border-box;
  }

  .footer-hide {
    .wrap {
      height: calc(100vh - 2rem) !important;
    }

    .footer-wrap {
      bottom: calc(-8rem + env(safe-area-inset-bottom, 0px));
    }
  }

  .footer-wrap {
    bottom: calc(0.5rem + env(safe-area-inset-bottom, 0px));
    left: 0.5rem;
    right: 0.5rem;
    width: auto;
  }
}

// 超小屏幕适配
@media (max-width: 480px) {
  .wrap {
    height: calc(100vh - 5rem);
    padding: 0 0.5rem;
  }

  .footer-hide {
    .wrap {
      height: calc(100vh - 1.5rem) !important;
    }

    .footer-wrap {
      bottom: calc(-7rem + env(safe-area-inset-bottom, 0px));
    }
  }

  .footer-wrap {
    bottom: calc(0.3rem + env(safe-area-inset-bottom, 0px));
    left: 0.3rem;
    right: 0.3rem;
  }

  .panel-wrap {
    padding: 0.5rem;
    left: 0 !important;
    right: 0 !important;
  }
}
</style>
