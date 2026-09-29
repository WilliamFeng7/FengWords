<script setup lang="ts">
import { BaseIcon, ToastComponent, Tooltip } from '@/base'
import Logo from '@/components/Logo.vue'
import IeDialog from '@/components/dialog/IeDialog.vue'
import useTheme, { setAccent } from '@/core/hooks/theme.ts'
import { useRuntimeStore } from '@/core/stores/runtime.ts'
import { useSettingStore } from '@/core/stores/setting.ts'
import { ShortcutKey } from '@/core/types/enum.ts'
import { nextTick, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import 'vue-virtual-scroller/dist/vue-virtual-scroller.css'
import { useInit } from '@/core/composables/useInit.ts'
import { useI18n } from 'vue-i18n'
import { Supabase } from '@/core/utils/supabase.ts'
import WordCollectPopover from '@/components/word/WordCollectPopover.vue'
import { replayIcon } from '@/base/icon/motion.ts'
import { APP_NAME } from '@/core/config/env.ts'

const router = useRouter()
const { toggleTheme, getTheme, setTheme } = useTheme()
const runtimeStore = useRuntimeStore()
const settingStore = useSettingStore()
const init = useInit()

// ── 侧栏：展开（停靠，页面同步让位）/ 收起（只留图标条）──
// 状态写在 <html data-rail> 上，由 CSS 决定侧栏与占位的宽度；
// head 里的脚本在首帧前从 localStorage 恢复它，刷新页面时不会先收起再弹开
const RAIL_KEY = 'fw-rail'
let railCollapsed = $ref(false)
let mainContentRef = $ref<HTMLElement | null>(null)

/**
 * 页面让位不再逐帧改宽度（那会让整页每帧重排、卡顿）：占位宽度一次到位，
 * 页面内容再用 transform 从原位置滑过来（FLIP），和侧栏边缘同一条曲线、同一时长，全程只走合成层。
 * 练习页里有固定定位的底栏，加 transform 会让它临时错位，所以练习页直接一步到位。
 */
function applyRail(collapsed: boolean, animate = false) {
  const main = mainContentRef
  const canGlide =
    animate &&
    !!main &&
    railCollapsed !== collapsed &&
    !route.path.startsWith('/practice') &&
    !window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const before = canGlide ? main!.getBoundingClientRect().left : 0

  railCollapsed = collapsed
  const root = document.documentElement
  if (collapsed) root.setAttribute('data-rail', 'collapsed')
  else root.removeAttribute('data-rail')
  try {
    localStorage.setItem(RAIL_KEY, collapsed ? 'collapsed' : 'expanded')
  } catch (e) {}

  if (canGlide) {
    const dx = before - main!.getBoundingClientRect().left
    if (Math.abs(dx) > 0.5) {
      main!.animate([{ transform: `translate3d(${dx}px, 0, 0)` }, { transform: 'none' }], {
        duration: 300,
        easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
      })
    }
  }
}

let railOpenRef = $ref<HTMLButtonElement | null>(null)

function setRailCollapsed(collapsed: boolean, e?: MouseEvent) {
  settingStore.sideExpand = !collapsed
  // 设置还没读完时也立即生效，读完后以设置为准
  if (!settingStore.load) applyRail(collapsed, true)
  // 触发它的按钮马上会被藏起来：键盘操作时把焦点交给另一头的按钮，鼠标点击则直接失焦，免得“展开”图标卡在显示状态
  const trigger = e?.currentTarget as HTMLElement | null
  if (e && e.detail === 0) {
    nextTick(() => {
      const next = collapsed ? railOpenRef : (railPanelRef?.querySelector('.rail-close') as HTMLElement | null)
      next?.focus({ preventScroll: true })
    })
  } else {
    trigger?.blur()
  }
}

function applyStoredPrefs() {
  applyRail(!settingStore.sideExpand)
  setTheme(settingStore.theme)
  setAccent(settingStore.themeColor)
}

watch(
  () => settingStore.load,
  n => {
    if (n) applyStoredPrefs()
  }
)

watch(
  () => settingStore.sideExpand,
  n => {
    if (settingStore.load) applyRail(!n, true)
  }
)

watch(
  () => settingStore.themeColor,
  n => {
    if (settingStore.load) setAccent(n, { animate: true })
  }
)

watch(
  () => settingStore.theme,
  n => {
    setTheme(n)
  }
)

const { locales, setLocale } = useI18n()
const route = useRoute()

const showIcon = $computed(() => {
  return ['/words', '/articles', '/setting', '/help', '/doc', '/feedback'].includes(route.path)
})

onMounted(() => {
  railCollapsed = document.documentElement.getAttribute('data-rail') === 'collapsed'
  // 从其它布局（如首页）切回来时设置早已读完，load 不会再变化，这里直接套用一次
  if (settingStore.load) applyStoredPrefs()
  init()
  window.umami?.track('sync', { check: Supabase.check() })
})

// ── 侧栏选中指示条：一块底色在菜单项之间滑动，而不是每项各自闪变 ──
let railPanelRef = $ref<HTMLElement | null>(null)
let indicatorY = $ref(0)
let indicatorVisible = $ref(false)
let indicatorReady = $ref(false)

function placeIndicator() {
  const panel = railPanelRef
  if (!panel) return
  const active = panel.querySelector('.row.router-link-active') as HTMLElement | null
  if (!active) {
    indicatorVisible = false
    return
  }
  indicatorY = active.getBoundingClientRect().top - panel.getBoundingClientRect().top
  indicatorVisible = true
  // 首次定位不滑动，之后才开启过渡
  if (!indicatorReady) requestAnimationFrame(() => requestAnimationFrame(() => (indicatorReady = true)))
}

watch(
  () => route.path,
  () => nextTick(placeIndicator)
)

onMounted(() => {
  nextTick(placeIndicator)
  window.addEventListener('resize', placeIndicator)
})

onBeforeUnmount(() => window.removeEventListener('resize', placeIndicator))

function onRowClick(e: MouseEvent) {
  const row = e.currentTarget as HTMLElement
  replayIcon(row)
  // 立即滑向被点的项，不等路由解析完成（watch 里会再校准一次）
  if (railPanelRef && !e.metaKey && !e.ctrlKey && !e.shiftKey) {
    indicatorY = row.getBoundingClientRect().top - railPanelRef.getBoundingClientRect().top
    indicatorVisible = true
  }
}

// 收起/展开时指示条跟着侧栏宽度一起变化，高度位置不变；过渡结束后再校准一次
function onRailTransitionEnd(e: TransitionEvent) {
  if (e.target === railPanelRef && e.propertyName === 'width') placeIndicator()
}
</script>

<template>
  <div class="layout anim">
    <!--    第一个aside 占位用-->
    <div class="aside space"></div>
    <nav class="aside rail" :aria-label="APP_NAME">
      <div class="rail-panel" ref="railPanelRef" @transitionend="onRailTransitionEnd">
        <div
          class="rail-indicator"
          :class="{ 'is-visible': indicatorVisible, 'is-ready': indicatorReady }"
          :style="{ transform: `translate3d(0, ${indicatorY}px, 0)` }"
          aria-hidden="true"
        ></div>
        <div class="top">
          <div class="rail-brand">
            <div class="brand-logo">
              <Logo />
              <!-- 收起时：悬停品牌方块，它换成“展开”图标，点击展开侧栏 -->
              <button
                ref="railOpenRef"
                type="button"
                class="rail-open"
                :tabindex="railCollapsed ? 0 : -1"
                :aria-hidden="!railCollapsed"
                :aria-label="$t('expand')"
                @click="setRailCollapsed(false, $event)"
              >
                <IconLucidePanelLeftOpen />
              </button>
            </div>
            <BaseIcon
              class="rail-close"
              :title="$t('collapse')"
              :swap="false"
              :tabindex="railCollapsed ? -1 : 0"
              role="button"
              :aria-label="$t('collapse')"
              @click="setRailCollapsed(true, $event)"
              @keydown.enter.prevent="setRailCollapsed(true, $event as any)"
              @keydown.space.prevent="setRailCollapsed(true, $event as any)"
            >
              <IconLucidePanelLeftClose />
            </BaseIcon>
          </div>
          <Tooltip :title="$t('words')" placement="right" :offset="20" :disabled="!railCollapsed">
            <NuxtLink to="/words" class="row" @click="onRowClick">
              <span class="row-icon"><IconLineMdTextBox /></span>
              <span class="row-label">{{ $t('words') }}</span>
            </NuxtLink>
          </Tooltip>
          <Tooltip :title="$t('articles')" placement="right" :offset="20" :disabled="!railCollapsed">
            <NuxtLink id="article" to="/articles" class="row" @click="onRowClick">
              <span class="row-icon"><IconLineMdDocumentList /></span>
              <span class="row-label">{{ $t('articles') }}</span>
            </NuxtLink>
          </Tooltip>
          <Tooltip :title="$t('feedback')" placement="right" :offset="20" :disabled="!railCollapsed">
            <NuxtLink to="/feedback" class="row" @click="onRowClick">
              <span class="row-icon"><IconLineMdChatRoundDots /></span>
              <span class="row-label">{{ $t('feedback') }}</span>
            </NuxtLink>
          </Tooltip>
          <Tooltip :title="$t('document')" placement="right" :offset="20" :disabled="!railCollapsed">
            <NuxtLink to="/doc" class="row" @click="onRowClick">
              <span class="row-icon"><IconLineMdFolder /></span>
              <span class="row-label">{{ $t('document') }}</span>
            </NuxtLink>
          </Tooltip>
          <Tooltip :title="$t('help')" placement="right" :offset="20" :disabled="!railCollapsed">
            <NuxtLink to="/help" class="row" @click="onRowClick">
              <span class="row-icon"><IconLineMdQuestionCircle /></span>
              <span class="row-label">{{ $t('help') }}</span>
            </NuxtLink>
          </Tooltip>
          <!--        <div class="row" @click="router.push('/user')">-->
          <!--          <IconFluentPerson20Regular/>-->
          <!--          <span >用户</span>-->
          <!--        </div>-->
        </div>
        <div class="bottom">
          <Tooltip :title="$t('setting')" placement="right" :offset="20" :disabled="!railCollapsed">
            <NuxtLink to="/setting" class="row" @click="onRowClick">
              <span class="row-icon"><IconLineMdCog /></span>
              <span class="row-label">{{ $t('setting') }}</span>
              <div class="rail-dot" v-if="runtimeStore.isError"></div>
            </NuxtLink>
          </Tooltip>
        </div>
      </div>
    </nav>

    <!-- 移动端顶部菜单栏 -->
    <div class="mobile-top-nav" :class="{ collapsed: settingStore.mobileNavCollapsed }">
      <div class="nav-items">
        <div class="nav-item" @click="router.push('/')" :class="{ active: route.path === '/' }">
          <IconLineMdHomeMd />
          <span>{{ $t('home_page') }}</span>
        </div>
        <div class="nav-item" @click="router.push('/words')" :class="{ active: route.path?.includes('/words') }">
          <IconLineMdTextBox />
          <span>{{ $t('words') }}</span>
        </div>
        <div class="nav-item" @click="router.push('/articles')" :class="{ active: route.path?.includes('/articles') }">
          <IconLineMdDocumentList />
          <span>{{ $t('articles') }}</span>
        </div>
        <div class="nav-item" @click="router.push('/setting')" :class="{ active: route.path === '/setting' }">
          <IconLineMdCog />
          <span>{{ $t('setting') }}</span>
          <div class="red-point" v-if="runtimeStore.isError"></div>
        </div>
      </div>
      <div class="nav-toggle" @click="settingStore.mobileNavCollapsed = !settingStore.mobileNavCollapsed">
        <IconLucideChevronDown class="nav-toggle-icon" />
      </div>
    </div>

    <IeDialog />

    <div class="flex-1 z-1 relative main-content overflow-x-hidden" ref="mainContentRef">
      <div
        class="mt-3 center relative z-9999 pointer-events-none"
        @click="router.push('/setting?index=6 ')"
        v-if="runtimeStore.isError"
      >
        <ToastComponent
          type="error"
          :duration="0"
          :shadow="false"
          :showClose="false"
          :message="$t('sync_failed_toast')"
        />
      </div>

      <!-- 顶部工具条：在文档流里占位，宽版便当网格不会再被右上角图标压住 -->
      <div class="top-bar" v-if="showIcon">
        <div class="utility-pill">
          <div class="relative group">
            <BaseIcon>
              <IconLucideLanguages />
            </BaseIcon>
            <div class="lang-bridge pt-2 absolute z-20 right-0 pointer-events-none group-hover:pointer-events-auto">
              <div class="lang-menu">
                <div v-for="locale in locales" @click="setLocale(locale.code)" class="lang-item">
                  {{ locale.name }}
                </div>
              </div>
            </div>
          </div>

          <!-- line-md 的日月图标自带形变动画：切换时新图标一挂载就从太阳变月亮（或反之） -->
          <BaseIcon
            :title="`${$t('toggle_theme')}(${settingStore.shortcutKeyMap[ShortcutKey.ToggleTheme]})`"
            :swap="false"
            @click="toggleTheme"
          >
            <!-- 主题只在客户端可知，服务端渲染时先占位，避免 SSR 页面图标错位 -->
            <ClientOnly>
              <IconLineMdSunnyOutlineToMoonTransition v-if="getTheme() === 'light'" />
              <IconLineMdMoonToSunnyOutlineTransition v-else />
              <template #fallback>
                <IconLineMdMoon />
              </template>
            </ClientOnly>
          </BaseIcon>
        </div>
      </div>

      <!--      <slot></slot>-->
      <router-view></router-view>
    </div>
    <WordCollectPopover />
  </div>
</template>

<style scoped lang="scss">
.layout {
  width: 100%;
  height: 100%;
  display: flex;
  background: var(--color-primary);
}

/* ── Rail ──────────────────────────────────────────────────── */
// 侧栏宽度与页面占位走同一条曲线、同一时长：侧栏右缘和页面左缘始终一起移动。
// 里面的 Logo、文字、收起按钮位置都固定不动，只被侧栏边缘揭开或遮住，再配合淡入淡出。
// 占位宽度 = 统一留白 --page-gutter + 侧栏宽（main.scss 的 --aside-width 与这里保持一致）
$rail-expanded: 13.25rem;
$rail-collapsed: 3.75rem; // 正好容下 2.5rem 的图标格
$rail-pad: calc(0.625rem - 1px); // 扣掉 1px 描边，图标格仍是 2.5rem
$rail-dur: 300ms;

.aside.space {
  flex-shrink: 0;
  height: 100vh;
  width: var(--aside-width);
  /* 不做宽度过渡：一次到位，页面内容用 FLIP 滑过去（见 applyRail） */
}

.rail {
  position: fixed;
  left: 0;
  top: 0;
  bottom: 0;
  z-index: 30;
  display: flex;
  box-sizing: border-box;
  /* 与页面、窗口右缘、卡片之间同一个留白 */
  padding: var(--page-gutter) 0 var(--page-gutter) var(--page-gutter);
}

.rail-panel {
  position: relative;
  width: $rail-expanded;
  height: 100%;
  box-sizing: border-box;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  padding: $rail-pad;
  background: var(--color-tile);
  border: 1px solid var(--color-stroke);
  border-radius: var(--radius-tile);
  box-shadow: var(--shadow-tile);
  transition: width $rail-dur var(--ease-drawer);
}

html[data-rail='collapsed'] .rail-panel {
  width: $rail-collapsed;
}

.rail-brand {
  position: relative;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  /* 固定宽度：收起时溢出部分被侧栏裁掉，展开时原地露出，不会跟着宽度滑动 */
  width: calc(#{$rail-expanded} - 2 * #{$rail-pad} - 2px);
  height: 2.5rem;
  margin-bottom: 0.75rem;

  :deep(.logo-word) {
    transition: opacity 200ms var(--ease-out) 80ms;
  }

  /* BaseIcon 渲染的是片段，只能从布局自己的元素用 :deep 够到它的包裹层 */
  :deep(.rail-close) {
    position: absolute;
    right: 0;
    top: 50%;
    width: 1.875rem;
    height: 1.875rem;
    margin-top: -0.9375rem;
    color: var(--color-ink-3);
    transition:
      opacity 200ms var(--ease-out) 100ms,
      background-color var(--dur-hover) ease,
      color var(--dur-hover) ease,
      transform 160ms var(--ease-out);
  }

  :deep(.rail-close:hover) {
    color: var(--color-ink-1);
  }
}

.brand-logo {
  position: relative;
}

/* 收起时盖在品牌方块上的“展开”按钮：平时透明，悬停时把 F 换成展开图标 */
.rail-open {
  position: absolute;
  left: 0;
  top: 0;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 0;
  border: 0;
  border-radius: 0.75rem;
  background: var(--color-brand);
  color: #fff;
  cursor: pointer;
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    inset 0 -3px 0 rgba(0, 0, 0, 0.18);
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 160ms ease,
    transform 160ms var(--ease-out);

  svg {
    display: block;
    width: 1.25rem;
    height: 1.25rem;
    transform: scale(0.8);
    transition: transform 220ms var(--ease-out);
  }

  &:active {
    transform: translateY(1px) scale(0.96);
  }

  &:focus-visible {
    outline-offset: 2px;
  }
}

html[data-rail='collapsed'] {
  .rail-brand :deep(.logo-word) {
    opacity: 0;
    transition-duration: 120ms;
    transition-delay: 0ms;
  }

  .rail-brand :deep(.rail-close) {
    opacity: 0;
    pointer-events: none;
    transition-delay: 0ms;
  }

  .rail-open {
    pointer-events: auto;

    &:focus-visible {
      opacity: 1;

      svg {
        transform: none;
      }
    }
  }

  .row-label {
    opacity: 0;
    transition-duration: 120ms;
    transition-delay: 0ms;
  }
}

@media (hover: hover) and (pointer: fine) {
  html[data-rail='collapsed'] .rail-open:hover {
    opacity: 1;

    svg {
      transform: none;
    }
  }
}

/* 一块底色在菜单项之间滑动（状态提示 + 空间连续性）；左右贴着侧栏内边距，收起时自然缩成圆角方块 */
.rail-indicator {
  position: absolute;
  top: -1px; /* 定位原点在描边内侧，位移量按外框量的，抵消 1px */
  left: $rail-pad;
  right: $rail-pad;
  height: 2.5rem;
  border-radius: 0.75rem;
  background: var(--color-brand-soft);
  opacity: 0;
  pointer-events: none;
  transition: opacity 160ms ease;

  &.is-visible {
    opacity: 1;
  }

  &.is-ready {
    transition:
      opacity 160ms ease,
      transform 260ms var(--ease-in-out);
  }
}

.row {
  @apply cp relative flex items-center shrink-0;
  height: 2.5rem;
  margin: 0.25rem 0;
  border-radius: 0.75rem;
  overflow: hidden;
  color: var(--color-main-text);
  white-space: nowrap;
  transition:
    background-color var(--dur-hover) ease,
    color var(--dur-hover) ease,
    transform 160ms var(--ease-out);

  &:active {
    transform: scale(0.97);
  }

  &:focus-visible {
    outline-offset: -2px;
  }

  &.router-link-active {
    color: var(--color-brand-text);
    font-weight: 600;
  }

  .row-icon {
    @apply flex items-center justify-center shrink-0;
    width: 2.5rem;
    height: 2.5rem;

    svg {
      display: block;
      width: 1.25rem;
      height: 1.25rem;
    }
  }

  .row-label {
    @apply shrink-0;
    transition: opacity 200ms var(--ease-out) 80ms;
  }
}

@media (hover: hover) and (pointer: fine) {
  .row:not(.router-link-active):hover {
    background: var(--color-tile-sunken);
    color: var(--color-ink-1);
  }
}

.bottom {
  padding-top: 0.375rem;
  border-top: 1px solid var(--color-line);
}

.rail-dot {
  @apply absolute rounded-full;
  top: 0.45rem;
  left: 1.6rem;
  width: 0.5rem;
  height: 0.5rem;
  background: var(--color-danger);
  box-shadow: 0 0 0 2px var(--color-tile);
}

/* ── Utility pill (theme / language) ─────────────────────── */
/* 与侧栏顶边、页面右缘对齐：同一个留白，同一个最大宽度 */
.top-bar {
  display: flex;
  justify-content: flex-end;
  box-sizing: border-box;
  max-width: calc(var(--page-max) + 2 * var(--page-gutter));
  padding: var(--page-gutter) var(--page-gutter) 0;
}

.utility-pill {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem;
  position: relative;
  z-index: 20;
  background: var(--color-tile);
  border: 1px solid var(--color-stroke);
  border-radius: 999px;
  box-shadow: var(--shadow-tile);

  :deep(.icon-wrapper) {
    border-radius: 999px;
  }
}

.lang-bridge {
  top: 100%;
}

.lang-menu {
  min-width: 9rem;
  padding: 0.375rem;
  background: var(--color-tile);
  border: 1px solid var(--color-stroke);
  border-radius: 0.875rem;
  box-shadow: var(--shadow-pop);
  transform-origin: top right;
  opacity: 0;
  transform: translate3d(0, -4px, 0) scale(0.97);
  transition:
    opacity 140ms var(--ease-out),
    transform 140ms var(--ease-out);
}

.group:hover .lang-menu {
  opacity: 1;
  transform: none;
  transition-duration: var(--dur-pop);
}

.lang-item {
  @apply cp break-keep;
  padding: 0.45rem 0.75rem;
  border-radius: 0.6rem;
  color: var(--color-main-text);
  transition:
    background-color var(--dur-hover) ease,
    color var(--dur-hover) ease;

  &:hover {
    background: var(--color-tile-sunken);
    color: var(--color-brand-text);
  }
}

// 移动端顶部菜单栏
.mobile-top-nav {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  background: var(--color-tile);
  border-bottom: 1px solid var(--color-item-border);
  box-shadow: 0 6px 20px -12px rgba(15, 23, 42, 0.25);
  z-index: 1000;
  transition: transform 300ms var(--ease-drawer);

  .nav-items {
    display: flex;
    justify-content: space-around;
    padding: 0.5rem 0;
    transition: opacity 200ms var(--ease-out);

    .nav-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0.5rem;
      cursor: pointer;
      transition: transform 160ms var(--ease-out);
      min-height: 44px;
      min-width: 44px;
      justify-content: center;
      position: relative;

      svg {
        font-size: 1.2rem;
        margin-bottom: 0.2rem;
        color: var(--color-main-text);
        transition: color var(--dur-hover) ease;
      }

      span {
        font-size: 0.7rem;
        color: var(--color-main-text);
        text-align: center;
        transition: color var(--dur-hover) ease;
      }

      &.active {
        svg,
        span {
          color: var(--color-brand-text);
        }
      }

      &:active {
        transform: scale(0.95);
      }

      .red-point {
        position: absolute;
        top: 0.2rem;
        right: 0.2rem;
        width: 0.4rem;
        height: 0.4rem;
        background: var(--color-danger);
        border-radius: 50%;
      }
    }
  }

  .nav-toggle {
    position: absolute;
    bottom: -1.5rem;
    left: 50%;
    transform: translateX(-50%);
    background: var(--color-tile);
    border: 1px solid var(--color-item-border);
    border-top: none;
    border-radius: 0 0 0.5rem 0.5rem;
    padding: 0.3rem 0.8rem;
    cursor: pointer;
    transition: transform 160ms var(--ease-out);

    svg {
      font-size: 1rem;
      color: var(--color-main-text);
    }

    .nav-toggle-icon {
      display: block;
      transition: transform 300ms var(--ease-drawer);
    }

    &:active {
      transform: translateX(-50%) scale(0.95);
    }
  }

  &.collapsed {
    transform: translateY(calc(-100% + 1.5rem));

    .nav-items {
      opacity: 0;
      pointer-events: none;
    }

    .nav-toggle-icon {
      transform: rotate(180deg);
    }
  }
}

.main-content {
  // 移动端时为主内容区域添加顶部内边距，避免被顶部菜单遮挡
  @media (max-width: 768px) {
    padding-top: 4rem;
  }
}

// 移动端隐藏左侧菜单栏
@media (max-width: 768px) {
  .aside {
    display: none;
  }

  .aside.space {
    display: none;
  }

  .main-content {
    width: 100%;
    margin-left: 0;
  }

  .top-bar {
    padding: 0.5rem 0.75rem 0;
  }
}

// 桌面端隐藏移动端顶部菜单栏
@media (min-width: 769px) {
  .mobile-top-nav {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rail-panel,
  .aside.space,
  .rail-indicator.is-ready {
    transition-duration: 0.01ms;
  }

  .row:active {
    transform: none;
  }
}
</style>
