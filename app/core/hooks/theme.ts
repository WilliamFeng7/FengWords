import { useSettingStore } from '../stores/setting.ts'

type Theme = 'light' | 'dark'

// 获取系统主题
export function getSystemTheme(): Theme {
  if (import.meta.server) return 'light'
  if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
    return 'dark'
  } else if (window.matchMedia('(prefers-color-scheme: light)').matches) {
    return 'light'
  }
  return 'light' // 默认浅色模式
}

// 交换主题名称
export function swapTheme(theme: Theme): Theme {
  return theme === 'light' ? 'dark' : 'light'
}

// 监听系统主题变化
export function listenToSystemThemeChange(call: (theme: Theme) => void) {
  if (import.meta.server) return
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', e => {
    if (e.matches) {
      // console.log('系统已切换到深色模式');
      call('dark')
    }
  })
  window.matchMedia('(prefers-color-scheme: light)').addEventListener('change', e => {
    if (e.matches) {
      // console.log('系统已切换到浅色模式');
      call('light')
    }
  })
}

let themeApplied = false

type ThemeSwitchOptions = {
  /** 点击位置：从这里以圆形向外揭开新主题 */
  origin?: { x: number; y: number }
  /** 直接切换，不做任何过渡（键盘快捷键触发时） */
  instant?: boolean
}

// 本机记住明暗主题/主题色，head 里的脚本在首帧前读它们（见 nuxt.config.ts），刷新时不再闪一下默认样式
function remember(key: string, val: string) {
  try {
    localStorage.setItem(key, val)
  } catch (e) {}
}

export function setTheme(val: string, options: ThemeSwitchOptions = {}) {
  // auto模式下，则通过查询系统主题来设置主题名称
  if (!import.meta.client) return
  if (val) remember('fw-theme', val)
  const next = val === 'auto' ? getSystemTheme() : val
  const root = document.documentElement
  const current = root.className.replace('theme-switching', '').replace('theme-reveal', '').trim()
  if (current === next) {
    themeApplied = true
    return
  }

  const origin = options.origin
  // 切换期间关闭所有元素自身的颜色过渡：整页只做一次过渡，而不是几百个元素各自渐变
  const apply = () => {
    root.className = next + ' theme-switching' + (origin ? ' theme-reveal' : '')
  }
  const done = () => {
    requestAnimationFrame(() =>
      requestAnimationFrame(() => root.classList.remove('theme-switching', 'theme-reveal'))
    )
  }

  // 首次应用主题（页面加载）与键盘切换不做动画；鼠标点击时从点击处圆形揭开，其余情况交叉淡入
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const startViewTransition = (document as any).startViewTransition
  const animate = themeApplied && !options.instant && !reduceMotion && typeof startViewTransition === 'function'
  themeApplied = true

  if (animate) {
    const transition = startViewTransition.call(document, apply)
    // 页面不可见等情况下浏览器会跳过过渡（DOM 仍会更新），吞掉 ready 的拒绝，避免未处理的 Promise 报错
    transition.ready
      ?.then(() => {
        if (!origin) return
        const radius = Math.hypot(
          Math.max(origin.x, window.innerWidth - origin.x),
          Math.max(origin.y, window.innerHeight - origin.y)
        )
        root.animate(
          {
            clipPath: [
              `circle(0px at ${origin.x}px ${origin.y}px)`,
              `circle(${radius}px at ${origin.x}px ${origin.y}px)`,
            ],
          },
          { duration: 520, easing: 'cubic-bezier(0.23, 1, 0.32, 1)', pseudoElement: '::view-transition-new(root)' }
        )
      })
      .catch(() => {})
    transition.finished.then(done, done)
  } else {
    apply()
    done()
  }
}

/** 可选主题色；blue 为默认（不写 data-accent，直接用 :root 里的蓝色） */
export const ACCENTS = ['blue', 'sky', 'teal', 'green', 'indigo', 'violet', 'pink', 'rose', 'orange', 'graphite'] as const
export type Accent = (typeof ACCENTS)[number]

/**
 * 切换主题色：只换 <html data-accent>，所有颜色都从品牌色变量派生。
 * animate 时整页交叉淡入一次（关掉各元素自己的颜色过渡），而不是几百个元素各自渐变、先后不齐。
 */
export function setAccent(val: string, options: { animate?: boolean } = {}) {
  if (!import.meta.client) return
  const next: Accent = (ACCENTS as readonly string[]).includes(val) ? (val as Accent) : 'blue'
  const root = document.documentElement
  remember('fw-accent', next)
  const current = root.getAttribute('data-accent') || 'blue'
  if (current === next) return

  const apply = () => {
    root.classList.add('theme-switching')
    if (next === 'blue') root.removeAttribute('data-accent')
    else root.setAttribute('data-accent', next)
  }
  const done = () =>
    requestAnimationFrame(() => requestAnimationFrame(() => root.classList.remove('theme-switching')))

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const startViewTransition = (document as any).startViewTransition
  if (options.animate && !reduceMotion && typeof startViewTransition === 'function') {
    const transition = startViewTransition.call(document, apply)
    transition.ready?.catch(() => {})
    transition.finished.then(done, done)
  } else {
    apply()
    done()
  }
}

export default function useTheme() {
  const settingStore = useSettingStore()

  // 开启监听系统主题变更,后期可以通过用户配置来决定是否开启
  listenToSystemThemeChange((theme: Theme) => {
    return
    // 如果系统主题变更后和当前的主题一致，则不需要再重新切换
    if (settingStore.theme === theme) {
      return
    }

    settingStore.theme = theme
    setTheme(theme)
  })

  function toggleTheme(e?: Event) {
    // auto模式下，默认是使用系统主题，切换时应该使用当前系统主题为基础进行切换
    settingStore.theme = swapTheme(settingStore.theme === 'auto' ? getSystemTheme() : (settingStore.theme as Theme))
    // 鼠标点击（detail > 0）才做揭开动画；键盘快捷键/键盘触发的点击直接切换
    const pointer = e instanceof MouseEvent && e.detail > 0 ? { x: e.clientX, y: e.clientY } : undefined
    setTheme(settingStore.theme, pointer ? { origin: pointer } : { instant: true })
  }

  // 获取当前具体的主题名称
  function getTheme(): Theme {
    if (import.meta.client) {
      return settingStore.theme === 'auto' ? getSystemTheme() : (settingStore.theme as Theme)
    }
    // auto模式下，则通过查询系统主题来获取当前具体的主题名称
  }

  return {
    toggleTheme,
    setTheme,
    getTheme,
  }
}
